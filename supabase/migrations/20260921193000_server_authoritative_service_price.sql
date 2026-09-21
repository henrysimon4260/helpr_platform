-- HLP-47: service.price is server-authoritative.
--
-- Clients may insert or update price only when it equals an unexpired
-- service_price_quote for the same service_type, description, and locations.
-- Confirm / AutoFill may set price to the assigned provider's fill-request bid
-- in the same update that moves an open, unassigned job to confirmed.
-- After a provider is assigned, or once payment_status is paid, clients cannot
-- change price. service_role bypasses this trigger (quote-service-price and
-- other edge functions).
--
-- This does not change capture timing. Checkout still charges the accepted bid
-- plus 3% processing and 1% platform. A direct client write cannot plant a
-- different service.price for that charge.

CREATE SCHEMA IF NOT EXISTS helpr_private;

REVOKE ALL ON SCHEMA helpr_private FROM PUBLIC;
GRANT USAGE ON SCHEMA helpr_private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION helpr_private.is_client_data_api_role()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  claims text;
  jwt_role text := '';
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RETURN true;
  END IF;

  BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '');
  EXCEPTION
    WHEN undefined_object THEN
      claims := NULL;
  END;

  IF claims IS NOT NULL THEN
    BEGIN
      jwt_role := coalesce(claims::jsonb ->> 'role', '');
    EXCEPTION
      WHEN invalid_text_representation THEN
        jwt_role := '';
    END;
  END IF;

  RETURN jwt_role IN ('anon', 'authenticated');
END;
$$;

REVOKE ALL ON FUNCTION helpr_private.is_client_data_api_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION helpr_private.is_client_data_api_role() TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.service_price_quote (
  quote_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid,
  service_type text NOT NULL,
  description text NOT NULL,
  start_location text NOT NULL DEFAULT '',
  end_location text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  needs_truck boolean NOT NULL DEFAULT false,
  price numeric NOT NULL CHECK (price > 0),
  note text,
  processing_fee numeric NOT NULL,
  platform_fee numeric NOT NULL,
  customer_total numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS service_price_quote_lookup
  ON public.service_price_quote (service_type, description, expires_at);

COMMENT ON TABLE public.service_price_quote IS
  'Server-issued price quotes. anon and authenticated cannot insert or update. service.price may match an unexpired row.';

ALTER TABLE public.service_price_quote ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.service_price_quote FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.service_price_quote TO service_role;

DROP POLICY IF EXISTS service_price_quote_service_role ON public.service_price_quote;
CREATE POLICY service_price_quote_service_role
  ON public.service_price_quote
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION helpr_private.service_quote_matches(
  p_service_type text,
  p_description text,
  p_start text,
  p_end text,
  p_location text,
  p_price numeric
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT p_price IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.service_price_quote q
      WHERE q.expires_at > now()
        AND q.service_type = btrim(coalesce(p_service_type, ''))
        AND q.description = btrim(coalesce(p_description, ''))
        AND q.start_location = btrim(coalesce(p_start, ''))
        AND q.end_location = btrim(coalesce(p_end, ''))
        AND q.location = btrim(coalesce(p_location, ''))
        AND q.price = p_price
    );
$$;

CREATE OR REPLACE FUNCTION helpr_private.accepted_bid_matches(
  p_service_id uuid,
  p_provider uuid,
  p_price numeric
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  matched boolean := false;
BEGIN
  IF p_service_id IS NULL OR p_provider IS NULL OR p_price IS NULL THEN
    RETURN false;
  END IF;
  IF to_regclass('public.service_fill_request') IS NULL THEN
    RETURN false;
  END IF;

  EXECUTE
    'SELECT EXISTS (
       SELECT 1
       FROM public.service_fill_request r
       WHERE r.service_id = $1
         AND r.service_provider_id = $2
         AND r.bid = $3
     )'
    INTO matched
    USING p_service_id, p_provider, p_price;

  RETURN coalesce(matched, false);
END;
$$;

REVOKE ALL ON FUNCTION helpr_private.service_quote_matches(text, text, text, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION helpr_private.accepted_bid_matches(uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION helpr_private.service_quote_matches(text, text, text, text, text, numeric) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION helpr_private.accepted_bid_matches(uuid, uuid, numeric) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION helpr_private.guard_service_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  old_status text;
  new_status text;
  price_same boolean;
  text_same boolean;
  previous_open boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NOT helpr_private.is_client_data_api_role() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.price IS NULL THEN
      RETURN NEW;
    END IF;
    IF helpr_private.service_quote_matches(
      NEW.service_type, NEW.description, NEW.start_location, NEW.end_location, NEW.location, NEW.price
    ) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'service.price is server-managed'
      USING ERRCODE = '42501';
  END IF;

  price_same := NEW.price IS NOT DISTINCT FROM OLD.price;
  text_same := btrim(coalesce(NEW.service_type, '')) = btrim(coalesce(OLD.service_type, ''))
    AND btrim(coalesce(NEW.description, '')) = btrim(coalesce(OLD.description, ''))
    AND btrim(coalesce(NEW.start_location, '')) = btrim(coalesce(OLD.start_location, ''))
    AND btrim(coalesce(NEW.end_location, '')) = btrim(coalesce(OLD.end_location, ''))
    AND btrim(coalesce(NEW.location, '')) = btrim(coalesce(OLD.location, ''));

  IF price_same AND text_same THEN
    RETURN NEW;
  END IF;

  IF price_same THEN
    IF helpr_private.service_quote_matches(
      NEW.service_type, NEW.description, NEW.start_location, NEW.end_location, NEW.location, NEW.price
    ) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'service.price is server-managed'
      USING ERRCODE = '42501';
  END IF;

  IF lower(btrim(coalesce(OLD.payment_status, ''))) IN ('paid', 'succeeded', 'captured') THEN
    RAISE EXCEPTION 'service.price is server-managed'
      USING ERRCODE = '42501';
  END IF;

  old_status := lower(btrim(coalesce(OLD.status, '')));
  new_status := lower(btrim(coalesce(NEW.status, '')));
  previous_open := old_status IN ('', 'finding_pros', 'pending', 'scheduled', 'select_service_provider')
    AND OLD.service_provider_id IS NULL;

  IF new_status = 'confirmed'
     AND OLD.service_provider_id IS NULL
     AND NEW.service_provider_id IS NOT NULL
     AND old_status IN ('finding_pros', 'pending', 'scheduled', 'select_service_provider')
     AND helpr_private.accepted_bid_matches(NEW.service_id, NEW.service_provider_id, NEW.price) THEN
    RETURN NEW;
  END IF;

  IF previous_open
     AND NEW.service_provider_id IS NULL
     AND new_status IN ('', 'finding_pros', 'pending', 'scheduled', 'select_service_provider')
     AND helpr_private.service_quote_matches(
       NEW.service_type, NEW.description, NEW.start_location, NEW.end_location, NEW.location, NEW.price
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'service.price is server-managed'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION helpr_private.guard_service_price() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION helpr_private.guard_service_price() TO anon, authenticated, service_role;

DO $guard$
BEGIN
  IF to_regclass('public.service') IS NULL THEN
    RAISE EXCEPTION 'public.service is missing; apply the baseline schema or restore the hosted table first';
  END IF;

  EXECUTE 'ALTER TABLE public.service ADD COLUMN IF NOT EXISTS payment_status text';
END
$guard$;

DROP TRIGGER IF EXISTS guard_service_price ON public.service;
CREATE TRIGGER guard_service_price
  BEFORE INSERT OR UPDATE ON public.service
  FOR EACH ROW
  EXECUTE FUNCTION helpr_private.guard_service_price();
