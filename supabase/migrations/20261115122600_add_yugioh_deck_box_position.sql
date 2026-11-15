begin;

alter table public.yugioh_decks
  add column if not exists deck_box_position integer
  check (deck_box_position is null or deck_box_position >= 1);

commit;

notify pgrst, 'reload schema';
