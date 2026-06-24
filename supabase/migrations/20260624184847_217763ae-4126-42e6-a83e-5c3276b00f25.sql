CREATE OR REPLACE FUNCTION public.admin_grant_credits(_user_id uuid, _amount integer, _note text, _granted_by uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance integer;
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

  INSERT INTO public.credit_ledger (user_id, delta, type, reason, balance_after, metadata)
  VALUES (
    _user_id,
    _amount,
    'admin_grant',
    COALESCE(NULLIF(_note, ''), 'Admin refill'),
    new_balance,
    jsonb_build_object('granted_by', _granted_by)
  );

  RETURN new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_grant_credits(uuid, integer, text, uuid) TO authenticated, service_role;