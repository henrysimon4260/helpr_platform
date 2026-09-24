-- HLP-55 concurrency proof for increment_provider_balance.
--
-- Run from the repo root:
--   sudo -u postgres psql -d postgres -c 'DROP DATABASE IF EXISTS helpr_balance_test'
--   sudo -u postgres psql -d postgres -c 'CREATE DATABASE helpr_balance_test'
--   sudo -u postgres psql -d helpr_balance_test -v ON_ERROR_STOP=1 -f supabase/tests/increment_provider_balance.sql
--
-- The overlapping section holds one credit uncommitted, starts a second
-- credit, and waits until that second backend is blocked on the row lock.
-- After the first transaction commits, the second result must be the sum.
-- A read-modify-write (SELECT balance; UPDATE balance = snapshot + amount)
-- returns the second amount only and fails this script.

\set ON_ERROR_STOP on

SELECT format('CREATE ROLE %I NOLOGIN', 'anon')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
\gexec
SELECT format('CREATE ROLE %I NOLOGIN', 'authenticated')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
\gexec
SELECT format('CREATE ROLE %I NOLOGIN', 'service_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
\gexec

CREATE TABLE IF NOT EXISTS public.service_provider (
  service_provider_id uuid PRIMARY KEY,
  balance numeric
);

\ir ../migrations/20260924023000_increment_provider_balance.sql

GRANT anon, authenticated, service_role TO CURRENT_USER;
GRANT SELECT, UPDATE ON TABLE public.service_provider TO service_role;

DELETE FROM public.service_provider
WHERE service_provider_id = '00000000-0000-4000-8000-000000000055';

INSERT INTO public.service_provider (service_provider_id, balance)
VALUES ('00000000-0000-4000-8000-000000000055', NULL);

DO $$
DECLARE
  got numeric;
  def text;
BEGIN
  def := pg_get_functiondef('public.increment_provider_balance(uuid, numeric)'::regprocedure);
  IF def NOT LIKE '%SET balance = coalesce(balance, 0) + p_amount%' THEN
    RAISE EXCEPTION 'function is not an atomic balance increment: %', def;
  END IF;
  IF def ILIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'increment_provider_balance must stay SECURITY INVOKER';
  END IF;

  IF has_function_privilege('anon', 'public.increment_provider_balance(uuid, numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute increment_provider_balance';
  END IF;
  IF has_function_privilege('authenticated', 'public.increment_provider_balance(uuid, numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can execute increment_provider_balance';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.increment_provider_balance(uuid, numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute increment_provider_balance';
  END IF;

  got := public.increment_provider_balance('00000000-0000-4000-8000-000000000055', 10.25);
  IF got IS DISTINCT FROM 10.25 THEN
    RAISE EXCEPTION 'null balance should credit from 0, got %', got;
  END IF;

  got := public.increment_provider_balance('00000000-0000-4000-8000-000000000055', 0.10);
  IF got IS DISTINCT FROM 10.35 THEN
    RAISE EXCEPTION 'expected 10.35 dollars, got %', got;
  END IF;

  got := public.increment_provider_balance('00000000-0000-4000-8000-000000000099', 5);
  IF got IS NOT NULL THEN
    RAISE EXCEPTION 'missing provider should return null, got %', got;
  END IF;
END;
$$;

DO $$
BEGIN
  PERFORM public.increment_provider_balance(NULL, 1);
  RAISE EXCEPTION 'null provider id was accepted';
EXCEPTION
  WHEN invalid_parameter_value THEN
    NULL;
END;
$$;

BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.increment_provider_balance('00000000-0000-4000-8000-000000000055', 1);
  RAISE EXCEPTION 'anon credited a balance';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END;
$$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  got numeric;
BEGIN
  got := public.increment_provider_balance('00000000-0000-4000-8000-000000000055', 1.00);
  IF got IS DISTINCT FROM 11.35 THEN
    RAISE EXCEPTION 'service_role credit expected 11.35, got %', got;
  END IF;
END;
$$;
ROLLBACK;

-- service_role credit rolled back. Stored balance is still 10.35.
DO $$
DECLARE
  stored numeric;
BEGIN
  SELECT balance INTO stored
  FROM public.service_provider
  WHERE service_provider_id = '00000000-0000-4000-8000-000000000055';
  IF stored IS DISTINCT FROM 10.35 THEN
    RAISE EXCEPTION 'rollback leaked a credit, balance is %', stored;
  END IF;
END;
$$;

CREATE EXTENSION IF NOT EXISTS dblink;

SELECT dblink_connect(
  'hlp55_a',
  format('dbname=%s host=/var/run/postgresql user=%s', current_database(), current_user)
);
SELECT dblink_connect(
  'hlp55_b',
  format('dbname=%s host=/var/run/postgresql user=%s', current_database(), current_user)
);

-- Known lost-update shape: both backends read 10.35, then both write 10.35 + 10.
SELECT dblink_exec('hlp55_a', 'BEGIN');
SELECT dblink_exec('hlp55_b', 'BEGIN');

SELECT balance AS read_a
FROM dblink(
  'hlp55_a',
  $$SELECT balance FROM public.service_provider WHERE service_provider_id = '00000000-0000-4000-8000-000000000055'$$
) AS t(balance numeric);

SELECT balance AS read_b
FROM dblink(
  'hlp55_b',
  $$SELECT balance FROM public.service_provider WHERE service_provider_id = '00000000-0000-4000-8000-000000000055'$$
) AS t(balance numeric);

SELECT dblink_exec(
  'hlp55_a',
  $$UPDATE public.service_provider SET balance = 10.35 + 10 WHERE service_provider_id = '00000000-0000-4000-8000-000000000055'$$
);
SELECT dblink_exec('hlp55_a', 'COMMIT');
SELECT dblink_exec(
  'hlp55_b',
  $$UPDATE public.service_provider SET balance = 10.35 + 10 WHERE service_provider_id = '00000000-0000-4000-8000-000000000055'$$
);
SELECT dblink_exec('hlp55_b', 'COMMIT');

DO $$
DECLARE
  stored numeric;
BEGIN
  SELECT balance INTO stored
  FROM public.service_provider
  WHERE service_provider_id = '00000000-0000-4000-8000-000000000055';
  IF stored IS DISTINCT FROM 20.35 THEN
    RAISE EXCEPTION 'control lost-update should end at 20.35 (one increment dropped), got %', stored;
  END IF;
END;
$$;

UPDATE public.service_provider
SET balance = 0
WHERE service_provider_id = '00000000-0000-4000-8000-000000000055';

-- Atomic path. A adds 10 and holds the row lock. B adds 7 and must block
-- until A commits, then return 17 rather than 7.
SELECT dblink_exec('hlp55_a', 'BEGIN');
SELECT credited
FROM dblink(
  'hlp55_a',
  $$SELECT public.increment_provider_balance('00000000-0000-4000-8000-000000000055'::uuid, 10)$$
) AS t(credited numeric);

SELECT dblink_send_query(
  'hlp55_b',
  $$SELECT public.increment_provider_balance('00000000-0000-4000-8000-000000000055'::uuid, 7)$$
);

DO $$
DECLARE
  blocked boolean := false;
BEGIN
  FOR i IN 1..100 LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_stat_activity
      WHERE state = 'active'
        AND wait_event_type = 'Lock'
        AND query LIKE '%increment_provider_balance%'
        AND pid <> pg_backend_pid()
    ) THEN
      blocked := true;
      EXIT;
    END IF;
    PERFORM pg_sleep(0.05);
  END LOOP;

  IF NOT blocked THEN
    RAISE EXCEPTION 'second credit did not block on the provider row lock';
  END IF;
END;
$$;

SELECT dblink_exec('hlp55_a', 'COMMIT');

DO $$
DECLARE
  credited numeric;
  stored numeric;
BEGIN
  SELECT balance INTO credited
  FROM dblink_get_result('hlp55_b') AS t(balance numeric);

  IF credited IS DISTINCT FROM 17 THEN
    RAISE EXCEPTION 'overlapping credits returned %, expected 17', credited;
  END IF;

  SELECT balance INTO stored
  FROM public.service_provider
  WHERE service_provider_id = '00000000-0000-4000-8000-000000000055';

  IF stored IS DISTINCT FROM 17 THEN
    RAISE EXCEPTION 'overlapping credits stored %, expected 17', stored;
  END IF;
END;
$$;

SELECT dblink_disconnect('hlp55_a');
SELECT dblink_disconnect('hlp55_b');
