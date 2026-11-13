begin;

alter table public.yugioh_decks
  add column if not exists battle_stats jsonb not null
    default '{"wins": 0, "losses": 0}'::jsonb;

update public.yugioh_decks
set battle_stats = jsonb_set(
  coalesce(battle_stats, '{}'::jsonb),
  '{losses}',
  to_jsonb(coalesce((battle_stats ->> 'losses')::integer, 0)),
  true
) - 'wins_against';

drop function if exists public.record_yugioh_battle_wins(uuid[], uuid[]);

create or replace function public.record_yugioh_battle_result(
  p_winner_deck_ids uuid[],
  p_loser_deck_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_deck_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(cardinality(p_winner_deck_ids), 0) = 0
    or coalesce(cardinality(p_loser_deck_ids), 0) = 0
  then
    raise exception 'Winner and loser decks are required' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_winner_deck_ids) as winners(deck_id)
    join unnest(p_loser_deck_ids) as losers(deck_id) using (deck_id)
  ) then
    raise exception 'A deck cannot be on both sides of a battle' using errcode = '22023';
  end if;

  for current_deck_id in
    select distinct decks.deck_id
    from unnest(p_winner_deck_ids || p_loser_deck_ids) as decks(deck_id)
    where decks.deck_id is not null
  loop
    if current_deck_id = any(p_winner_deck_ids) then
      update public.yugioh_decks as deck
      set battle_stats = jsonb_set(
        coalesce(deck.battle_stats, '{}'::jsonb),
        '{wins}',
        to_jsonb(coalesce((deck.battle_stats ->> 'wins')::integer, 0) + 1),
        true
      )
      where deck.id = current_deck_id;
    else
      update public.yugioh_decks as deck
      set battle_stats = jsonb_set(
        coalesce(deck.battle_stats, '{}'::jsonb),
        '{losses}',
        to_jsonb(coalesce((deck.battle_stats ->> 'losses')::integer, 0) + 1),
        true
      )
      where deck.id = current_deck_id;
    end if;

    if not found then
      raise exception 'Battle deck not found' using errcode = 'P0002';
    end if;
  end loop;
end;
$$;

revoke all on function public.record_yugioh_battle_result(uuid[], uuid[]) from public, anon;
grant execute on function public.record_yugioh_battle_result(uuid[], uuid[]) to authenticated;

commit;

notify pgrst, 'reload schema';
