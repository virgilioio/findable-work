ALTER TABLE public.candidates DROP CONSTRAINT candidates_stage_check;
ALTER TABLE public.candidates ADD CONSTRAINT candidates_stage_check
  CHECK (stage = ANY (ARRAY['Applied'::text, 'Sourced'::text, 'Contacted'::text, 'Screening'::text, 'Interview'::text, 'Offer'::text]));