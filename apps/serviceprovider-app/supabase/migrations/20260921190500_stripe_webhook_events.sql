-- Stripe webhook event ids. Replay of a processed id is a no-op.
-- Service role only. No client policies: the Data API must not insert
-- event ids or forge payment_status transitions.

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  outcome text not null default 'processing',
  service_id text,
  payment_status text,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_webhook_events_outcome_check
    check (outcome in ('processing', 'processed', 'ignored', 'error'))
);

comment on table public.stripe_webhook_events is
  'Stripe webhook event ids. Service role only. A processed event id is not applied again.';

alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_webhook_events force row level security;

revoke all on table public.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on table public.stripe_webhook_events to service_role;
