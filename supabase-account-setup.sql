-- Watch, Feast and Game account setup
-- Roles: user (standard application access) and admin (account/role management).
-- Run this script in the Supabase SQL Editor as a project administrator.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null
    check (username ~ '^[a-z0-9][a-z0-9_.-]{2,23}$'),
  email text not null,
  role text not null default 'user'
    check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

create unique index if not exists profiles_email_lower_unique
  on public.profiles (lower(email));

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (username) on table public.profiles to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_username text;
begin
  if tg_op = 'INSERT' then
    base_username := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
    if base_username is null or base_username !~ '^[a-z0-9][a-z0-9_.-]{2,23}$' then
      base_username := lower(regexp_replace(
        split_part(coalesce(new.email, ''), '@', 1),
        '[^a-z0-9_.-]', '', 'g'
      ));
      base_username := regexp_replace(base_username, '^[^a-z0-9]+', '', 'g');
      if length(base_username) < 3 then
        base_username := 'user';
      end if;
      base_username := left(base_username, 14) || '-' || left(new.id::text, 8);
    end if;

    insert into public.profiles (id, username, email, role)
    values (
      new.id,
      base_username,
      lower(new.email),
      'user'
    )
    on conflict (id) do update
      set email = excluded.email,
          updated_at = now();
  else
    update public.profiles
      set email = lower(new.email),
          updated_at = now()
      where id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_auth_user_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_profile_created on auth.users;
create trigger on_auth_user_profile_created
  after insert on auth.users
  for each row execute function public.handle_auth_user_profile();

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_auth_user_profile();

-- Create profiles for accounts that existed before this script was installed.
-- A short UUID suffix keeps generated usernames unique; users can later change them.
insert into public.profiles (id, username, email, role)
select
  au.id,
  left(
    case
      when length(regexp_replace(
        regexp_replace(lower(split_part(coalesce(au.email, ''), '@', 1)), '[^a-z0-9_.-]', '', 'g'),
        '^[^a-z0-9]+', '', 'g'
      )) >= 3
      then left(regexp_replace(
        regexp_replace(lower(split_part(coalesce(au.email, ''), '@', 1)), '[^a-z0-9_.-]', '', 'g'),
        '^[^a-z0-9]+', '', 'g'
      ), 14)
      else 'user'
    end || '-' || left(au.id::text, 8),
    24
  ),
  lower(au.email),
  'user'
from auth.users au
where au.email is not null
on conflict (id) do update
  set email = excluded.email,
      updated_at = now();

-- Promote only this existing, verified account. If it does not exist yet,
-- create it through an administrator-issued registration link, then run this
-- script again.
update public.profiles p
set role = 'admin',
    updated_at = now()
from auth.users au
where au.id = p.id
  and lower(au.email) = '1keinsuchti1@gmail.com'
  and au.email_confirmed_at is not null;

create or replace function public.set_profile_role(target_user_id uuid, target_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_admin_count integer;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Administrator role required' using errcode = '42501';
  end if;
  if target_role is null or target_role not in ('user', 'admin') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;
  if target_user_id = (select auth.uid()) then
    raise exception 'Administrators cannot change their own role' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.profiles.admin-role'));
  select count(*) into current_admin_count
  from public.profiles
  where role = 'admin';

  if target_role = 'user'
    and current_admin_count <= 1
    and exists (
      select 1 from public.profiles
      where id = target_user_id and role = 'admin'
    )
  then
    raise exception 'The last administrator cannot be demoted' using errcode = '23514';
  end if;

  update public.profiles
  set role = target_role,
      updated_at = now()
  where id = target_user_id;

  if not found then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_profile_role(uuid, text) from public, anon;
grant execute on function public.set_profile_role(uuid, text) to authenticated;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_user_role text;
  current_admin_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.profiles.admin-role'));

  select role into current_user_role
  from public.profiles
  where id = current_user_id;

  if current_user_role = 'admin' then
    select count(*) into current_admin_count
    from public.profiles
    where role = 'admin';

    if current_admin_count <= 1 then
      raise exception 'The last administrator cannot delete their account' using errcode = '23514';
    end if;
  end if;

  delete from auth.users
  where id = current_user_id;

  if not found then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

create table if not exists public.registration_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  consumed_at timestamptz
);

alter table public.registration_invites enable row level security;
revoke all on table public.registration_invites from public, anon, authenticated;
grant select, insert on table public.registration_invites to service_role;

create or replace function public.consume_registration_invite(invitation_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.registration_invites
  set consumed_at = now()
  where token_hash = invitation_token_hash
    and expires_at > now()
    and consumed_at is null;

  return found;
end;
$$;

revoke all on function public.consume_registration_invite(text) from public, anon, authenticated;
grant execute on function public.consume_registration_invite(text) to service_role;

commit;

notify pgrst, 'reload schema';
