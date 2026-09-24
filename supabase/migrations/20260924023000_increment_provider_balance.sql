-- HLP-55: credit service_provider.balance in one statement.
--
-- complete-service used to read balance and then write
-- balance = <that snapshot> + amount. Two completions for the same
-- provider could both read the same value; the later write dropped the
-- earlier increment.
--
-- This function is a single UPDATE. The row lock serializes concurrent
-- credits, and each one adds to the committed balance:
--
--   SET balance = coalesce(balance, 0) + p_amount
--
-- Units are unchanged: dollars, the same numeric unit as
-- service_provider.balance and complete-service provider_amount
-- (integer cents / 100). This is not a cents column.
--
-- coalesce matches the previous (balance || 0) read. A null stored
-- balance is treated as 0. A missing provider updates nothing and
-- returns null (the old update of zero rows was not an error).
--
-- SECURITY INVOKER so the caller is still subject to table privileges
-- and the HLP-46 balance trigger. EXECUTE is limited to service_role,
-- which is how complete-service connects. anon and authenticated cannot
-- call it. Direct balance updates stay locked by HLP-46; this migration
-- does not change capture timing, fees, or those policies.
--
-- Apply on the hosted database before or with the complete-service deploy
-- (SQL editor as postgres, or supabase db push once supabase/config.toml
-- from the schema migration is present). Re-applying replaces the function
-- and repeats the grants.

CREATE OR REPLACE FUNCTION public.increment_provider_balance(
  p_service_provider_id uuid,
  p_amount numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  updated_balance numeric;
BEGIN
  IF p_service_provider_id IS NULL THEN
    RAISE EXCEPTION 'p_service_provider_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL THEN
    RAISE EXCEPTION 'p_amount is required'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.service_provider
  SET balance = coalesce(balance, 0) + p_amount
  WHERE service_provider_id = p_service_provider_id
  RETURNING balance INTO updated_balance;

  RETURN updated_balance;
END;
$$;

COMMENT ON FUNCTION public.increment_provider_balance(uuid, numeric) IS
  'HLP-55. Atomically add p_amount dollars to service_provider.balance. service_role only.';

REVOKE ALL ON FUNCTION public.increment_provider_balance(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_provider_balance(uuid, numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_provider_balance(uuid, numeric) TO service_role;

-- The SET expression reads the current balance, and RETURNING reads the new
-- one, so service_role needs SELECT as well as UPDATE. Hosted Supabase already
-- grants this; repeat it when the table is present. HLP-46's service_role
-- grant is broader and is left as-is.
DO $$
BEGIN
  IF to_regclass('public.service_provider') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, UPDATE ON TABLE public.service_provider TO service_role';
  END IF;
END;
$$;
