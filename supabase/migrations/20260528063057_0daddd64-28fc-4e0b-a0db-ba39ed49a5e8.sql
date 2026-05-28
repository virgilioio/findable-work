ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS pdl_id text;
CREATE INDEX IF NOT EXISTS candidates_pdl_id_idx ON public.candidates(user_id, pdl_id);