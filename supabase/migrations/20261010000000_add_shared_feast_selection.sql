begin;

create table if not exists public.feast_pinned_selection (
  id smallint primary key default 1 check (id = 1),
  snack_item_id text,
  dinner_item_id text
);

alter table public.feast_pinned_selection enable row level security;

revoke all on table public.feast_pinned_selection from anon, authenticated;
grant select, insert, update on table public.feast_pinned_selection to authenticated;

drop policy if exists feast_pinned_selection_authenticated_all
  on public.feast_pinned_selection;
create policy feast_pinned_selection_authenticated_all
  on public.feast_pinned_selection
  for all
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

insert into public.feast_pinned_selection (id)
values (1)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'feast_pinned_selection'
  ) then
    alter publication supabase_realtime
      add table public.feast_pinned_selection;
  end if;
end
$$;

commit;
