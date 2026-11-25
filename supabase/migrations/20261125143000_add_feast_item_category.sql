begin;

alter table public.feast_items
  add column if not exists category text not null default 'Abendessen';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'feast_items_category_check'
      and conrelid = 'public.feast_items'::regclass
  ) then
    alter table public.feast_items
      add constraint feast_items_category_check
      check (category in ('Snack', 'Abendessen'));
  end if;
end
$$;

commit;
