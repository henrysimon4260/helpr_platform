-- One complete-service payout ledger row per service.
-- The edge function claims this row before creating a Stripe transfer.
-- If duplicate service_id rows already exist, skip the index so this
-- migration can still be applied. Stripe idempotency keys still block a
-- second transfer until those duplicates are removed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.platform_transactions
    GROUP BY service_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Skipping unique index: platform_transactions.service_id has duplicates';
    RETURN;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS platform_transactions_service_id_key
    ON public.platform_transactions (service_id);
END $$;
