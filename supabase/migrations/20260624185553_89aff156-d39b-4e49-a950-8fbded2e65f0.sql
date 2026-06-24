CREATE OR REPLACE FUNCTION public.admin_grant_credits(_user_id uuid, _amount integer, _note text, _granted_by uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance integer;
  reason_text text;
BEGIN
  IF NOT public.has_role(_granted_by, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  UPDATE public.profiles
  SET credits_remaining = COALESCE(credits_remaining, 0) + _amount
  WHERE id = _user_id
  RETURNING credits_remaining INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  reason_text := COALESCE(NULLIF(_note, ''), 'Admin refill') || ' (admin_grant by ' || _granted_by::text || ')';

  INSERT INTO public.credit_ledger (user_id, delta, reason)
  VALUES (_user_id, _amount, reason_text);

  RETURN new_balance;
END;
$$;