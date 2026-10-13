begin;

create table if not exists public.item_ratings (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('feast', 'beer', 'cocktail', 'custom_list')),
  item_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating numeric(3,1) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint item_ratings_value_check check (
    (item_type = 'beer' and rating >= 1 and rating <= 6)
    or (item_type <> 'beer' and rating >= 1 and rating <= 5)
  ),
  constraint item_ratings_item_user_unique unique (item_type, item_id, user_id)
);

create index if not exists item_ratings_item_lookup
  on public.item_ratings (item_type, item_id);

alter table public.item_ratings enable row level security;

revoke all on table public.item_ratings from anon, authenticated;
grant select, insert, update, delete on table public.item_ratings to authenticated;

drop policy if exists item_ratings_authenticated_read on public.item_ratings;
create policy item_ratings_authenticated_read
  on public.item_ratings
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists item_ratings_own_write on public.item_ratings;
create policy item_ratings_own_write
  on public.item_ratings
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.get_item_rating_summaries(
  p_item_type text,
  p_item_ids text[]
)
returns table (
  item_id text,
  average_rating numeric,
  rating_count bigint,
  my_rating numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ratings.item_id,
    round(avg(ratings.rating), 1),
    count(*),
    max(ratings.rating) filter (where ratings.user_id = (select auth.uid()))
  from public.item_ratings as ratings
  where (select auth.uid()) is not null
    and p_item_type in ('feast', 'beer', 'cocktail', 'custom_list')
    and ratings.item_type = p_item_type
    and ratings.item_id = any(coalesce(p_item_ids, array[]::text[]))
  group by ratings.item_id;
$$;

revoke all on function public.get_item_rating_summaries(text, text[]) from public, anon;
grant execute on function public.get_item_rating_summaries(text, text[]) to authenticated;

drop policy if exists custom_lists_authenticated_shared_read on public.custom_lists;
create policy custom_lists_authenticated_shared_read
  on public.custom_lists
  for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists custom_list_items_authenticated_shared_read on public.custom_list_items;
create policy custom_list_items_authenticated_shared_read
  on public.custom_list_items
  for select
  to authenticated
  using ((select auth.uid()) is not null);

insert into public.item_ratings (item_type, item_id, user_id, rating)
select 'feast', id::text, user_id, rating::numeric
from public.feast_items
where user_id is not null and rating > 0 and rating <= 5
on conflict (item_type, item_id, user_id) do nothing;

insert into public.item_ratings (item_type, item_id, user_id, rating)
select 'beer', id::text, user_id, rating::numeric
from public.beer_items
where user_id is not null and rating >= 1 and rating <= 6
on conflict (item_type, item_id, user_id) do nothing;

insert into public.item_ratings (item_type, item_id, user_id, rating)
select 'cocktail', id::text, user_id, rating::numeric
from public.cocktail_items
where user_id is not null and rating > 0 and rating <= 5
on conflict (item_type, item_id, user_id) do nothing;

insert into public.item_ratings (item_type, item_id, user_id, rating)
select 'custom_list', id::text, user_id, rating::numeric
from public.custom_list_items
where user_id is not null and rating > 0 and rating <= 5
on conflict (item_type, item_id, user_id) do nothing;

commit;
