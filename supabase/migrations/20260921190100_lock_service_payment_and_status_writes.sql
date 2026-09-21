-- HLP-46: stop anon/authenticated clients from marking a job paid or completed.
--
-- Investigated client writes (anon key in both apps):
--   select-helpr.tsx          service.update includes payment_status = 'paid'
--   ServiceDetails.tsx        service.update status for helpr_otw / in_progress;
--                             completed goes through complete-service, but the
--                             column was still writable with the anon key
--   landing.tsx               status confirmed / select_service_provider / finding_pros
--   booked-services + forms   insert finding_pros; update schedule and description
--   complete-service          service role sets status = completed and reads
--                             payment_status / payment_intent_id
--   create-payment-intent     does not persist payment_status today
--
-- service_role bypasses RLS and keeps table privileges, so complete-service
-- and a later create-payment-intent write still succeed. Triggers below also
-- allow service_role (and any session that is not the Data API client).
--
-- This does not change capture timing or fee math.
--
-- Apply on the hosted database after the baseline migration (or on its own
-- when public.service already exists):
--   supabase db push
-- or paste this file into the SQL editor as the postgres role.
-- New columns added to public.service later are not client-writable until
-- this column-grant block is repeated for them.

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

CREATE OR REPLACE FUNCTION helpr_private.guard_service_privileged_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  new_status text;
  old_status text;
  new_payment text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT helpr_private.is_client_data_api_role() THEN
      RETURN OLD;
    END IF;

    old_status := lower(btrim(coalesce(OLD.status, '')));
    IF old_status = 'completed' OR lower(btrim(coalesce(OLD.payment_status, ''))) = 'paid' THEN
      RAISE EXCEPTION 'settled services cannot be deleted by the client'
        USING ERRCODE = '42501';
    END IF;

    RETURN OLD;
  END IF;

  IF NOT helpr_private.is_client_data_api_role() THEN
    RETURN NEW;
  END IF;

  new_status := lower(btrim(coalesce(NEW.status, '')));
  new_payment := lower(btrim(coalesce(NEW.payment_status, '')));

  IF TG_OP = 'INSERT' THEN
    IF new_status = 'completed' THEN
      RAISE EXCEPTION 'status completed is server-managed'
        USING ERRCODE = '42501';
    END IF;

    IF new_payment IN ('paid', 'succeeded', 'captured', 'refunded') THEN
      RAISE EXCEPTION 'payment_status is server-managed'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.payment_intent_id IS NOT NULL THEN
      RAISE EXCEPTION 'payment_intent_id is server-managed'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  old_status := lower(btrim(coalesce(OLD.status, '')));

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    RAISE EXCEPTION 'payment_status is server-managed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id THEN
    RAISE EXCEPTION 'payment_intent_id is server-managed'
      USING ERRCODE = '42501';
  END IF;

  -- Block marking completed and un-completing. Other client transitions
  -- (finding_pros, select_service_provider, confirmed, helpr_otw, in_progress)
  -- stay with the apps, per JOB_CONTRACT.
  IF new_status IS DISTINCT FROM old_status
     AND (new_status = 'completed' OR old_status = 'completed') THEN
    RAISE EXCEPTION 'status completed is server-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION helpr_private.guard_service_privileged_writes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION helpr_private.guard_service_privileged_writes() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION helpr_private.guard_provider_balance_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT helpr_private.is_client_data_api_role() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.balance, 0) <> 0 THEN
      RAISE EXCEPTION 'service_provider.balance is server-managed'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.balance IS DISTINCT FROM OLD.balance THEN
    RAISE EXCEPTION 'service_provider.balance is server-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION helpr_private.guard_provider_balance_writes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION helpr_private.guard_provider_balance_writes() TO anon, authenticated, service_role;

DO $lock$
BEGIN
  IF to_regclass('public.service') IS NULL THEN
    RAISE EXCEPTION 'public.service is missing; apply the baseline migration or restore the hosted table first';
  END IF;

  EXECUTE 'ALTER TABLE public.service ADD COLUMN IF NOT EXISTS payment_status text';
  EXECUTE 'ALTER TABLE public.service ADD COLUMN IF NOT EXISTS payment_intent_id text';

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'service'
      AND column_name = 'status'
  ) THEN
    RAISE EXCEPTION 'public.service.status is missing';
  END IF;

  IF to_regclass('public.service_provider') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'service_provider'
         AND column_name = 'balance'
     ) THEN
    RAISE EXCEPTION 'public.service_provider.balance is missing';
  END IF;

  IF to_regclass('public.platform_transactions') IS NULL THEN
    RAISE EXCEPTION 'public.platform_transactions is missing';
  END IF;
END
$lock$;

DROP TRIGGER IF EXISTS guard_service_privileged_writes ON public.service;
CREATE TRIGGER guard_service_privileged_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.service
  FOR EACH ROW
  EXECUTE FUNCTION helpr_private.guard_service_privileged_writes();

DROP TRIGGER IF EXISTS guard_provider_balance_writes ON public.service_provider;
CREATE TRIGGER guard_provider_balance_writes
  BEFORE INSERT OR UPDATE ON public.service_provider
  FOR EACH ROW
  EXECUTE FUNCTION helpr_private.guard_provider_balance_writes();

-- Column privileges: a table-level UPDATE would still cover payment_status,
-- so revoke table INSERT/UPDATE and grant every column except the payment ones.
DO $grants$
DECLARE
  service_write_cols text;
  provider_update_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO service_write_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'service'
    AND column_name NOT IN ('payment_status', 'payment_intent_id');

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO provider_update_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'service_provider'
    AND column_name <> 'balance';

  IF service_write_cols IS NULL OR provider_update_cols IS NULL THEN
    RAISE EXCEPTION 'could not build client column grant lists';
  END IF;

  EXECUTE 'REVOKE INSERT, UPDATE ON TABLE public.service FROM PUBLIC, anon, authenticated';
  EXECUTE format(
    'GRANT INSERT (%s) ON TABLE public.service TO anon, authenticated',
    service_write_cols
  );
  EXECUTE format(
    'GRANT UPDATE (%s) ON TABLE public.service TO anon, authenticated',
    service_write_cols
  );
  EXECUTE 'GRANT SELECT, DELETE ON TABLE public.service TO anon, authenticated';

  EXECUTE 'REVOKE UPDATE ON TABLE public.service_provider FROM PUBLIC, anon, authenticated';
  EXECUTE format(
    'GRANT UPDATE (%s) ON TABLE public.service_provider TO anon, authenticated',
    provider_update_cols
  );
  -- Do not grant DELETE here. Hosted DELETE, if any, is left as it was.
  EXECUTE 'GRANT SELECT, INSERT ON TABLE public.service_provider TO anon, authenticated';

  EXECUTE 'REVOKE ALL ON TABLE public.platform_transactions FROM PUBLIC, anon, authenticated';

  EXECUTE 'GRANT ALL ON TABLE public.service TO service_role';
  EXECUTE 'GRANT ALL ON TABLE public.service_provider TO service_role';
  EXECUTE 'GRANT ALL ON TABLE public.platform_transactions TO service_role';
END
$grants$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

ALTER TABLE public.service ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_provider ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_transactions ENABLE ROW LEVEL SECURITY;

-- Permissive policies restore the current open row model only when the hosted
-- database has none. Provider feed and customer screens read rows they do not
-- own; an auth.uid() policy would break that. Existing permissive policies are
-- left in place. Restrictive policies below always AND with them.
DO $policies$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'service'
      AND permissive = 'PERMISSIVE'
      AND cmd IN ('SELECT', 'ALL')
      AND (roles && ARRAY['anon', 'authenticated', 'public']::name[])
  ) THEN
    CREATE POLICY hlp46_service_select ON public.service
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'service'
      AND permissive = 'PERMISSIVE'
      AND cmd IN ('INSERT', 'ALL')
      AND (roles && ARRAY['anon', 'authenticated', 'public']::name[])
  ) THEN
    CREATE POLICY hlp46_service_insert ON public.service
      FOR INSERT TO anon, authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'service'
      AND permissive = 'PERMISSIVE'
      AND cmd IN ('UPDATE', 'ALL')
      AND (roles && ARRAY['anon', 'authenticated', 'public']::name[])
  ) THEN
    CREATE POLICY hlp46_service_update ON public.service
      FOR UPDATE TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'service'
      AND permissive = 'PERMISSIVE'
      AND cmd IN ('DELETE', 'ALL')
      AND (roles && ARRAY['anon', 'authenticated', 'public']::name[])
  ) THEN
    CREATE POLICY hlp46_service_delete ON public.service
      FOR DELETE TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'service_provider'
      AND permissive = 'PERMISSIVE'
      AND cmd IN ('SELECT', 'ALL')
      AND (roles && ARRAY['anon', 'authenticated', 'public']::name[])
  ) THEN
    CREATE POLICY hlp46_service_provider_select ON public.service_provider
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'service_provider'
      AND permissive = 'PERMISSIVE'
      AND cmd IN ('INSERT', 'ALL')
      AND (roles && ARRAY['anon', 'authenticated', 'public']::name[])
  ) THEN
    CREATE POLICY hlp46_service_provider_insert ON public.service_provider
      FOR INSERT TO anon, authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'service_provider'
      AND permissive = 'PERMISSIVE'
      AND cmd IN ('UPDATE', 'ALL')
      AND (roles && ARRAY['anon', 'authenticated', 'public']::name[])
  ) THEN
    CREATE POLICY hlp46_service_provider_update ON public.service_provider
      FOR UPDATE TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END
$policies$;

DROP POLICY IF EXISTS hlp46_service_insert_block_privileged ON public.service;
CREATE POLICY hlp46_service_insert_block_privileged
  ON public.service
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    coalesce(lower(btrim(status)), '') <> 'completed'
    AND coalesce(lower(btrim(payment_status)), '') NOT IN ('paid', 'succeeded', 'captured', 'refunded')
    AND payment_intent_id IS NULL
  );

DROP POLICY IF EXISTS hlp46_service_update_block_completed ON public.service;
CREATE POLICY hlp46_service_update_block_completed
  ON public.service
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (coalesce(lower(btrim(status)), '') <> 'completed');

-- Settled deletes are rejected in helpr_private.guard_service_privileged_writes.
-- A restrictive DELETE policy that hides those rows makes PostgREST report
-- success and delete nothing. The trigger raises instead.

-- service_role is the edge-function path. Supabase also grants it BYPASSRLS;
-- these policies cover a database where that attribute is not set.
DROP POLICY IF EXISTS hlp46_service_service_role ON public.service;
CREATE POLICY hlp46_service_service_role
  ON public.service
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS hlp46_service_provider_service_role ON public.service_provider;
CREATE POLICY hlp46_service_provider_service_role
  ON public.service_provider
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS hlp46_platform_transactions_service_role ON public.platform_transactions;
CREATE POLICY hlp46_platform_transactions_service_role
  ON public.platform_transactions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS hlp46_platform_transactions_deny_client ON public.platform_transactions;
CREATE POLICY hlp46_platform_transactions_deny_client
  ON public.platform_transactions
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
