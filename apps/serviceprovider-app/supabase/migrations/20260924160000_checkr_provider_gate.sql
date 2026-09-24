-- Checkr go-live gate (HLP-50).
-- checkr_status is written only by the service role (invite + webhook functions).
-- Existing providers become not_started. Do not backfill clear.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

ALTER TABLE public.service_provider
  ADD COLUMN IF NOT EXISTS checkr_candidate_id text,
  ADD COLUMN IF NOT EXISTS checkr_invitation_id text,
  ADD COLUMN IF NOT EXISTS checkr_report_id text,
  ADD COLUMN IF NOT EXISTS checkr_invitation_url text,
  ADD COLUMN IF NOT EXISTS checkr_invitation_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkr_package text,
  ADD COLUMN IF NOT EXISTS checkr_work_state text,
  ADD COLUMN IF NOT EXISTS checkr_last_event text,
  ADD COLUMN IF NOT EXISTS checkr_status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkr_status text;

UPDATE public.service_provider
SET checkr_status = 'not_started'
WHERE checkr_status IS NULL;

ALTER TABLE public.service_provider
  ALTER COLUMN checkr_status SET DEFAULT 'not_started';

ALTER TABLE public.service_provider
  ALTER COLUMN checkr_status SET NOT NULL;

ALTER TABLE public.service_provider
  DROP CONSTRAINT IF EXISTS service_provider_checkr_status_check;

ALTER TABLE public.service_provider
  ADD CONSTRAINT service_provider_checkr_status_check
  CHECK (checkr_status IN (
    'not_started',
    'pending',
    'clear',
    'consider',
    'suspended',
    'expired',
    'canceled'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS service_provider_checkr_candidate_id_key
  ON public.service_provider (checkr_candidate_id)
  WHERE checkr_candidate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS service_provider_checkr_report_id_idx
  ON public.service_provider (checkr_report_id)
  WHERE checkr_report_id IS NOT NULL;

COMMENT ON COLUMN public.service_provider.checkr_status IS
  'Checkr gate. clear is the only go-live value. Written by service role from Checkr, never by the client.';

CREATE OR REPLACE FUNCTION private.checkr_actor_is_service()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
    OR current_user IN ('postgres', 'supabase_admin', 'service_role')
    OR coalesce(current_setting('role', true), '') = 'service_role';
$$;

CREATE OR REPLACE FUNCTION private.protect_service_provider_checkr_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF private.checkr_actor_is_service() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.checkr_candidate_id := NULL;
    NEW.checkr_invitation_id := NULL;
    NEW.checkr_report_id := NULL;
    NEW.checkr_invitation_url := NULL;
    NEW.checkr_invitation_expires_at := NULL;
    NEW.checkr_package := NULL;
    NEW.checkr_work_state := NULL;
    NEW.checkr_last_event := NULL;
    NEW.checkr_status_updated_at := NULL;
    NEW.checkr_status := 'not_started';
    RETURN NEW;
  END IF;

  IF NEW.checkr_candidate_id IS DISTINCT FROM OLD.checkr_candidate_id
    OR NEW.checkr_invitation_id IS DISTINCT FROM OLD.checkr_invitation_id
    OR NEW.checkr_report_id IS DISTINCT FROM OLD.checkr_report_id
    OR NEW.checkr_invitation_url IS DISTINCT FROM OLD.checkr_invitation_url
    OR NEW.checkr_invitation_expires_at IS DISTINCT FROM OLD.checkr_invitation_expires_at
    OR NEW.checkr_package IS DISTINCT FROM OLD.checkr_package
    OR NEW.checkr_work_state IS DISTINCT FROM OLD.checkr_work_state
    OR NEW.checkr_last_event IS DISTINCT FROM OLD.checkr_last_event
    OR NEW.checkr_status_updated_at IS DISTINCT FROM OLD.checkr_status_updated_at
    OR NEW.checkr_status IS DISTINCT FROM OLD.checkr_status
  THEN
    RAISE EXCEPTION 'Checkr fields are managed by the background-check service'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_service_provider_checkr_fields ON public.service_provider;

CREATE TRIGGER protect_service_provider_checkr_fields
  BEFORE INSERT OR UPDATE ON public.service_provider
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_service_provider_checkr_fields();

CREATE OR REPLACE FUNCTION private.provider_checkr_is_clear(provider_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.service_provider
    WHERE service_provider_id::text = provider_id
      AND checkr_status = 'clear'
  );
$$;

CREATE OR REPLACE FUNCTION private.enforce_checkr_clear_on_fill_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT private.provider_checkr_is_clear(NEW.service_provider_id::text) THEN
    RAISE EXCEPTION 'Checkr background check must be clear before accepting work.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_checkr_clear_on_fill_request ON public.service_fill_request;

CREATE TRIGGER enforce_checkr_clear_on_fill_request
  BEFORE INSERT OR UPDATE ON public.service_fill_request
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_checkr_clear_on_fill_request();

CREATE OR REPLACE FUNCTION private.enforce_checkr_clear_on_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.service_provider_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.service_provider_id IS NOT DISTINCT FROM OLD.service_provider_id THEN
    RETURN NEW;
  END IF;

  IF NOT private.provider_checkr_is_clear(NEW.service_provider_id::text) THEN
    RAISE EXCEPTION 'This pro cannot accept paid work until their Checkr background check is clear.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_checkr_clear_on_assignment ON public.service;

CREATE TRIGGER enforce_checkr_clear_on_assignment
  BEFORE INSERT OR UPDATE ON public.service
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_checkr_clear_on_assignment();

REVOKE ALL ON FUNCTION private.checkr_actor_is_service() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.protect_service_provider_checkr_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.provider_checkr_is_clear(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_checkr_clear_on_fill_request() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_checkr_clear_on_assignment() FROM PUBLIC;
