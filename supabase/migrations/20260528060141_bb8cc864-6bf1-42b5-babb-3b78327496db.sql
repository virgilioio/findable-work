
REVOKE EXECUTE ON FUNCTION public.increment_sourcing_usage(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_sourcing_usage(uuid, integer) TO service_role;
