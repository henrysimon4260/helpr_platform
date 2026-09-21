-- Proves anon/authenticated cannot mark a service paid or completed, and that
-- service_role still can. Run from the repo root:
--   sudo -u postgres psql -d helpr_rls_test -v ON_ERROR_STOP=1 -f supabase/tests/lock_privileged_writes.sql

\set ON_ERROR_STOP on

SELECT format('CREATE ROLE %I NOLOGIN', 'anon')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
\gexec
SELECT format('CREATE ROLE %I NOLOGIN', 'authenticated')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
\gexec
SELECT 'CREATE ROLE service_role NOLOGIN BYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
\gexec

\ir ../migrations/20260921190000_baseline_service_payment_schema.sql
\ir ../migrations/20260921190100_lock_service_payment_and_status_writes.sql

ALTER TABLE public.service ADD COLUMN IF NOT EXISTS surprise text;

CREATE OR REPLACE FUNCTION pg_temp.assert_denied(p_sql text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'expected permission denial, but statement succeeded: %', p_sql;
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(p_sql text, p_expected text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  found text;
BEGIN
  EXECUTE p_sql INTO found;
  IF found IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'expected %, got % from %', p_expected, found, p_sql;
  END IF;
END;
$$;

GRANT anon, authenticated, service_role TO postgres;

INSERT INTO public.service_provider (service_provider_id, first_name, balance)
VALUES ('00000000-0000-4000-8000-0000000000a1', 'Ada', 0);

INSERT INTO public.service (
  service_id, customer_id, status, price, description
) VALUES (
  '00000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-0000000000c1',
  'finding_pros',
  120,
  'client-owned job'
);

-- Dashboard / migration session (no Data API JWT) may repair payment fields.
UPDATE public.service
SET payment_status = 'unpaid', payment_intent_id = NULL
WHERE service_id = '00000000-0000-4000-8000-0000000000b1';

BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT pg_temp.assert_denied($$
  UPDATE public.service
  SET payment_status = 'paid'
  WHERE service_id = '00000000-0000-4000-8000-0000000000b1'
$$);
ROLLBACK;

BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

UPDATE public.service
SET status = 'select_service_provider'
WHERE service_id = '00000000-0000-4000-8000-0000000000b1';

UPDATE public.service
SET status = 'confirmed',
    service_provider_id = '00000000-0000-4000-8000-0000000000a1',
    price = 95,
    scheduled_date_time = now()
WHERE service_id = '00000000-0000-4000-8000-0000000000b1';

UPDATE public.service
SET status = 'helpr_otw'
WHERE service_id = '00000000-0000-4000-8000-0000000000b1';

UPDATE public.service
SET status = 'in_progress'
WHERE service_id = '00000000-0000-4000-8000-0000000000b1';

UPDATE public.service
SET scheduling_type = 'scheduled',
    description = 'still editable before completion'
WHERE service_id = '00000000-0000-4000-8000-0000000000b1';

-- select-helpr.tsx sends payment_status together with confirmed.
SELECT pg_temp.assert_denied($$
  UPDATE public.service
  SET service_provider_id = '00000000-0000-4000-8000-0000000000a1',
      status = 'confirmed',
      price = 95,
      payment_status = 'paid'
  WHERE service_id = '00000000-0000-4000-8000-0000000000b1'
$$);

SELECT pg_temp.assert_denied($$
  UPDATE public.service
  SET payment_intent_id = 'pi_client_forged'
  WHERE service_id = '00000000-0000-4000-8000-0000000000b1'
$$);

SELECT pg_temp.assert_denied($$
  UPDATE public.service
  SET status = 'completed'
  WHERE service_id = '00000000-0000-4000-8000-0000000000b1'
$$);

SELECT pg_temp.assert_denied($$
  INSERT INTO public.service (service_id, status, payment_status)
  VALUES ('00000000-0000-4000-8000-0000000000b2', 'finding_pros', 'paid')
$$);

SELECT pg_temp.assert_denied($$
  INSERT INTO public.service (service_id, status, payment_intent_id)
  VALUES ('00000000-0000-4000-8000-0000000000b3', 'completed', 'pi_forged')
$$);

SELECT pg_temp.assert_denied($$
  UPDATE public.service SET surprise = 'forged' WHERE service_id = '00000000-0000-4000-8000-0000000000b1'
$$);

SELECT pg_temp.assert_denied($$
  INSERT INTO public.platform_transactions (service_id, status, total_amount)
  VALUES ('00000000-0000-4000-8000-0000000000b1', 'completed', 100)
$$);

SELECT pg_temp.assert_denied($$
  UPDATE public.service_provider
  SET balance = 9999
  WHERE service_provider_id = '00000000-0000-4000-8000-0000000000a1'
$$);

SELECT pg_temp.assert_denied($$
  INSERT INTO public.service_provider (service_provider_id, first_name, balance)
  VALUES ('00000000-0000-4000-8000-0000000000a2', 'Eve', 50)
$$);

UPDATE public.service_provider
SET first_name = 'Ada Edited'
WHERE service_provider_id = '00000000-0000-4000-8000-0000000000a1';

INSERT INTO public.service_provider (service_provider_id, first_name, balance)
VALUES ('00000000-0000-4000-8000-0000000000a3', 'New', 0);

COMMIT;

SELECT pg_temp.assert_eq(
  $$SELECT status FROM public.service WHERE service_id = '00000000-0000-4000-8000-0000000000b1'$$,
  'in_progress'
);
SELECT pg_temp.assert_eq(
  $$SELECT payment_status FROM public.service WHERE service_id = '00000000-0000-4000-8000-0000000000b1'$$,
  'unpaid'
);
SELECT pg_temp.assert_eq(
  $$SELECT first_name FROM public.service_provider WHERE service_provider_id = '00000000-0000-4000-8000-0000000000a1'$$,
  'Ada Edited'
);
SELECT pg_temp.assert_eq(
  $$SELECT balance::text FROM public.service_provider WHERE service_provider_id = '00000000-0000-4000-8000-0000000000a1'$$,
  '0'
);

BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_denied($$
  UPDATE public.service
  SET payment_status = 'paid', status = 'completed'
  WHERE service_id = '00000000-0000-4000-8000-0000000000b1'
$$);
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;

UPDATE public.service
SET payment_status = 'paid',
    payment_intent_id = 'pi_server',
    status = 'completed'
WHERE service_id = '00000000-0000-4000-8000-0000000000b1';

UPDATE public.service_provider
SET balance = 95
WHERE service_provider_id = '00000000-0000-4000-8000-0000000000a1';

INSERT INTO public.platform_transactions (
  service_id, provider_id, total_amount, status, stripe_payment_intent_id
) VALUES (
  '00000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-0000000000a1',
  95,
  'completed',
  'pi_server'
);

COMMIT;

SELECT pg_temp.assert_eq(
  $$SELECT status || ':' || payment_status || ':' || payment_intent_id
    FROM public.service WHERE service_id = '00000000-0000-4000-8000-0000000000b1'$$,
  'completed:paid:pi_server'
);

BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

SELECT pg_temp.assert_denied($$
  UPDATE public.service
  SET status = 'finding_pros'
  WHERE service_id = '00000000-0000-4000-8000-0000000000b1'
$$);

SELECT pg_temp.assert_denied($$
  DELETE FROM public.service
  WHERE service_id = '00000000-0000-4000-8000-0000000000b1'
$$);

INSERT INTO public.service (service_id, status)
VALUES ('00000000-0000-4000-8000-0000000000b4', 'finding_pros');

DELETE FROM public.service
WHERE service_id = '00000000-0000-4000-8000-0000000000b4';

COMMIT;

SELECT pg_temp.assert_eq(
  $$SELECT status FROM public.service WHERE service_id = '00000000-0000-4000-8000-0000000000b1'$$,
  'completed'
);
SELECT pg_temp.assert_eq(
  $$SELECT count(*)::text FROM public.service WHERE service_id = '00000000-0000-4000-8000-0000000000b4'$$,
  '0'
);
SELECT pg_temp.assert_eq(
  $$SELECT count(*)::text FROM public.platform_transactions WHERE stripe_payment_intent_id = 'pi_server'$$,
  '1'
);

\echo 'lock_privileged_writes: ok'
