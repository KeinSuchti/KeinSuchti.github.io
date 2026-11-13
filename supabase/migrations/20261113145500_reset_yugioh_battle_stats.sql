begin;

update public.yugioh_decks
set battle_stats = jsonb_set(
  jsonb_set(
    coalesce(battle_stats, '{}'::jsonb),
    '{wins}',
    '0'::jsonb,
    true
  ),
  '{losses}',
  '0'::jsonb,
  true
) - 'wins_against';

commit;
