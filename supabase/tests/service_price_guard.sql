-- Proves a client JWT cannot plant service.price.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/service_price_guard.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

BEGIN;

CREATE TABLE IF NOT EXISTS public.service (
  service_id uuid PRIMARY KEY,
  customer_id uuid,
  service_provider_id uuid,
  service_type text,
  status text,
  start_location text,
  end_location text,
  location text,
  price numeric,
  description text,
  payment_status text
);

CREATE TABLE IF NOT EXISTS public.service_fill_request (
  service_id uuid,
  service_provider_id uuid,
  bid numeric
);

\ir ../migrations/20260921193000_server_authoritative_service_price.sql

SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);

INSERT INTO public.service_price_quote (
  service_type, description, start_location, end_location, location, needs_truck,
  price, processing_fee, platform_fee, customer_total, expires_at
) VALUES (
  'cleaning', 'Deep clean a studio', '', '', '10 Broadway', false,
  85, 2.55, 0.85, 88.40, now() + interval '1 hour'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.service (service_id, service_type, status, description, location, price)
    VALUES ('00000000-0000-4000-8000-000000000001', 'cleaning', 'finding_pros', 'Deep clean a studio', '10 Broadway', 1);
    RAISE EXCEPTION 'arbitrary insert price was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

INSERT INTO public.service (service_id, service_type, status, description, location, price)
VALUES ('00000000-0000-4000-8000-000000000002', 'cleaning', 'finding_pros', 'Deep clean a studio', '10 Broadway', 85);

DO $$
BEGIN
  BEGIN
    UPDATE public.service
    SET price = 5
    WHERE service_id = '00000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'arbitrary update price was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

DO $$
BEGIN
  BEGIN
    UPDATE public.service
    SET description = 'Whole house'
    WHERE service_id = '00000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'description change without a quote was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

INSERT INTO public.service_fill_request (service_id, service_provider_id, bid)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-0000000000aa',
  140
);

UPDATE public.service
SET status = 'confirmed',
    service_provider_id = '00000000-0000-4000-8000-0000000000aa',
    price = 140
WHERE service_id = '00000000-0000-4000-8000-000000000002';

UPDATE public.service
SET payment_status = 'paid'
WHERE service_id = '00000000-0000-4000-8000-000000000002';

DO $$
BEGIN
  BEGIN
    UPDATE public.service
    SET price = 1
    WHERE service_id = '00000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'paid price rewrite was accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END
$$;

SELECT set_config('request.jwt.claims', '', true);

INSERT INTO public.service (service_id, service_type, status, description, location, price)
VALUES ('00000000-0000-4000-8000-000000000003', 'cleaning', 'finding_pros', 'Server role write', '10 Broadway', 7);

DO $$
DECLARE
  stored numeric;
BEGIN
  SELECT price INTO stored
  FROM public.service
  WHERE service_id = '00000000-0000-4000-8000-000000000002';
  IF stored IS DISTINCT FROM 140 THEN
    RAISE EXCEPTION 'expected confirmed price 140, found %', stored;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.service
    WHERE service_id = '00000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'arbitrary price row was inserted';
  END IF;
END
$$;

ROLLBACK;
