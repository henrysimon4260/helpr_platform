-- HLP-46 baseline for the service / payment tables the apps already use.
--
-- The hosted project host (hecikcopbdhhiilhgmrd.supabase.co) does not resolve,
-- so this is not a pg_dump. It is the column set read and written by the
-- customer app, the provider app, and complete-service. Types match those
-- writes (uuid ids generated in the client, numeric money, text statuses).
--
-- CREATE TABLE IF NOT EXISTS is a no-op when the hosted tables already exist.
-- It does not alter column types, add missing hosted columns, or drop extras.
-- Apply the following lock migration either way.

CREATE TABLE IF NOT EXISTS public.service (
  service_id uuid PRIMARY KEY,
  customer_id uuid,
  service_provider_id uuid,
  date_of_creation timestamptz,
  service_type text,
  status text,
  scheduling_type text,
  scheduled_date_time timestamptz,
  start_location text,
  end_location text,
  location text,
  price numeric,
  start_datetime timestamptz,
  end_datetime timestamptz,
  payment_method_type text,
  autofill_type text,
  description text,
  payment_status text,
  payment_intent_id text
);

COMMENT ON TABLE public.service IS
  'Job row. payment_status, payment_intent_id, and status=completed are server-only (see lock migration).';

COMMENT ON COLUMN public.service.payment_status IS
  'Server-only. anon/authenticated must not write this. Expected client-visible value after a service-role write: paid.';

COMMENT ON COLUMN public.service.payment_intent_id IS
  'Server-only Stripe PaymentIntent id. Written with the service role, not the anon key.';

COMMENT ON COLUMN public.service.status IS
  'Job status. Clients may drive the pre-completion machine. completed is server-only.';

CREATE TABLE IF NOT EXISTS public.service_provider (
  service_provider_id uuid PRIMARY KEY,
  first_name text,
  last_name text,
  email text,
  phone numeric,
  jobs_completed integer,
  rating numeric,
  profile_picture_url text,
  balance numeric NOT NULL DEFAULT 0,
  stripe_account_id text
);

COMMENT ON COLUMN public.service_provider.balance IS
  'Provider earnings balance. Updated by complete-service with the service role. Clients may insert 0 at signup and must not change it afterward.';

CREATE TABLE IF NOT EXISTS public.platform_transactions (
  transaction_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  provider_id uuid,
  service_id uuid,
  total_amount numeric,
  platform_fee numeric,
  provider_amount numeric,
  stripe_fee numeric,
  net_platform_fee numeric,
  stripe_charge_id text,
  stripe_transfer_id text,
  stripe_payment_intent_id text,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_transactions IS
  'Ledger written by complete-service. Not writable by anon or authenticated.';
