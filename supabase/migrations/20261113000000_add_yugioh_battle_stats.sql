begin;

alter table public.yugioh_decks
  add column if not exists battle_stats jsonb not null
    default '{"wins": 0, "wins_against": {}}'::jsonb;

create or replace function public.record_yugioh_battle_wins(
  p_winner_deck_ids uuid[],
  p_opponent_deck_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_winner_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce(cardinality(p_winner_deck_ids), 0) = 0
    or coalesce(cardinality(p_opponent_deck_ids), 0) = 0
  then
    raise exception 'Winner and opponent decks are required' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_winner_deck_ids) as winners(deck_id)
    join unnest(p_opponent_deck_ids) as opponents(deck_id) using (deck_id)
  ) then
    raise exception 'A deck cannot be on both sides of a battle' using errcode = '22023';
  end if;

  for current_winner_id in
    select distinct winners.deck_id
    from unnest(p_winner_deck_ids) as winners(deck_id)
    where winners.deck_id is not null
  loop
    if not exists (
      select 1
      from public.yugioh_decks as opponent
      where opponent.id = any(p_opponent_deck_ids)
        and opponent.id <> current_winner_id
    ) then
      raise exception 'Opponent deck not found' using errcode = 'P0002';
    end if;

    update public.yugioh_decks as winner
    set battle_stats = jsonb_set(
      jsonb_set(
        coalesce(winner.battle_stats, '{}'::jsonb),
        '{wins}',
        to_jsonb(coalesce((winner.battle_stats ->> 'wins')::integer, 0) + 1),
        true
      ),
      '{wins_against}',
      coalesce(winner.battle_stats -> 'wins_against', '{}'::jsonb) || coalesce((
        select jsonb_object_agg(
          opponent.id::text,
          jsonb_build_object(
            'name', opponent.theme,
            'wins',
            coalesce(
              (winner.battle_stats -> 'wins_against' -> (opponent.id::text) ->> 'wins')::integer,
              0
            ) + 1
          )
        )
        from public.yugioh_decks as opponent
        where opponent.id = any(p_opponent_deck_ids)
          and opponent.id <> current_winner_id
      ), '{}'::jsonb),
      true
    )
    where winner.id = current_winner_id;

    if not found then
      raise exception 'Winner deck not found' using errcode = 'P0002';
    end if;
  end loop;
end;
$$;

revoke all on function public.record_yugioh_battle_wins(uuid[], uuid[]) from public, anon;
grant execute on function public.record_yugioh_battle_wins(uuid[], uuid[]) to authenticated;

commit;

notify pgrst, 'reload schema';
