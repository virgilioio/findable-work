ALTER TABLE public.conversations ADD COLUMN pinned_at timestamptz NULL;
CREATE INDEX conversations_user_pinned_idx ON public.conversations(user_id, pinned_at DESC NULLS LAST, updated_at DESC);