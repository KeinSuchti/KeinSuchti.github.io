ALTER TABLE public.yugioh_decks
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';
