-- Helpr Happiness is discretionary goodwill. It is not insurance.
-- Apply this migration before relying on completed_at or the claim table.
-- Deploy order: this file, then the resolve-happiness-claim function.

alter table public.service
  add column if not exists completed_at timestamptz;

comment on column public.service.completed_at is
  'Set when the job first reaches completed. Helpr Happiness measures its 30-day window from this value, then date_of_creation.';

create schema if not exists helpr_private;

revoke all on schema helpr_private from public;
revoke all on schema helpr_private from anon, authenticated;

create table if not exists public.helpr_happiness_claim (
  id uuid primary key default gen_random_uuid(),
  service_id text not null,
  customer_id text not null,
  service_provider_id text,
  incident_type text not null,
  narrative text not null,
  amount_requested_cents integer not null,
  evidence_notes text not null,
  evidence_paths text[] not null default '{}',
  acknowledged_not_insurance boolean not null default false,
  acknowledged_secondary boolean not null default false,
  acknowledged_exclusions boolean not null default false,
  negligence_attestation boolean not null default false,
  own_coverage_pursued boolean not null,
  own_coverage_notes text,
  status text not null default 'submitted',
  outcome text,
  amount_approved_cents integer,
  payout_method text,
  stripe_refund_id text,
  decision_notes text,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint helpr_happiness_claim_incident_chk
    check (incident_type in ('property_damage', 'theft', 'limited_injury')),
  constraint helpr_happiness_claim_amount_chk
    check (amount_requested_cents between 1 and 100000),
  constraint helpr_happiness_claim_status_chk
    check (status in ('submitted', 'needs_info', 'denied', 'paid')),
  constraint helpr_happiness_claim_outcome_chk
    check (outcome is null or outcome in ('approved', 'partial', 'denied', 'needs_info')),
  constraint helpr_happiness_claim_approved_chk
    check (amount_approved_cents is null or amount_approved_cents between 0 and 100000),
  constraint helpr_happiness_claim_payout_chk
    check (payout_method is null or payout_method in ('stripe_refund', 'manual')),
  constraint helpr_happiness_claim_ack_chk
    check (
      acknowledged_not_insurance
      and acknowledged_secondary
      and acknowledged_exclusions
      and negligence_attestation
    ),
  constraint helpr_happiness_claim_paid_chk
    check (
      status <> 'paid'
      or (
        outcome in ('approved', 'partial')
        and amount_approved_cents > 0
        and amount_approved_cents <= 100000
        and payout_method is not null
      )
    )
);

create unique index if not exists helpr_happiness_claim_one_per_service
  on public.helpr_happiness_claim (service_id);

create index if not exists helpr_happiness_claim_customer_idx
  on public.helpr_happiness_claim (customer_id, created_at desc);

comment on table public.helpr_happiness_claim is
  'Discretionary goodwill requests for Helpr Happiness. Not an insurance claim file.';

create or replace function helpr_private.enforce_happiness_claim_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_payment_status text;
  v_customer_id text;
  v_provider_id text;
  v_completed_at timestamptz;
  v_created_at timestamptz;
  v_anchor timestamptz;
  v_path text;
  v_uid text;
begin
  if tg_op = 'UPDATE' then
    if coalesce(auth.role(), '') <> 'service_role'
       and current_user not in ('postgres', 'supabase_admin') then
      raise exception 'Only Helpr operations can update a Happiness request';
    end if;

    if new.service_id is distinct from old.service_id
       or new.customer_id is distinct from old.customer_id
       or new.id is distinct from old.id then
      raise exception 'The job and customer on a Happiness request cannot change';
    end if;

    new.updated_at := now();
    return new;
  end if;

  v_uid := auth.uid()::text;
  if v_uid is null then
    raise exception 'Sign in to file a Helpr Happiness request';
  end if;

  if new.customer_id is distinct from v_uid then
    raise exception 'You can only file a Helpr Happiness request for your own account';
  end if;

  if new.acknowledged_not_insurance is not true
     or new.acknowledged_secondary is not true
     or new.acknowledged_exclusions is not true
     or new.negligence_attestation is not true then
    raise exception 'Confirm the goodwill terms before filing';
  end if;

  if coalesce(length(trim(new.narrative)), 0) < 20 then
    raise exception 'Describe what happened in a few sentences';
  end if;

  if coalesce(length(trim(new.evidence_notes)), 0) < 20 then
    raise exception 'Describe the evidence you are providing';
  end if;

  if new.own_coverage_pursued is false
     and coalesce(length(trim(new.own_coverage_notes)), 0) < 10 then
    raise exception 'Say whether you asked your own insurer, or why that policy does not apply';
  end if;

  if new.evidence_paths is null then
    new.evidence_paths := '{}';
  end if;

  if cardinality(new.evidence_paths) > 8 then
    raise exception 'Attach at most 8 files';
  end if;

  foreach v_path in array new.evidence_paths loop
    if v_path not like v_uid || '/' || new.id::text || '/%' then
      raise exception 'Evidence files must be stored on this request';
    end if;
  end loop;

  select
    s.status,
    s.payment_status,
    s.customer_id::text,
    s.service_provider_id::text,
    s.completed_at,
    s.date_of_creation
  into
    v_status,
    v_payment_status,
    v_customer_id,
    v_provider_id,
    v_completed_at,
    v_created_at
  from public.service as s
  where s.service_id::text = new.service_id;

  if not found then
    raise exception 'That job could not be found';
  end if;

  if v_customer_id is distinct from v_uid then
    raise exception 'This job belongs to a different account';
  end if;

  if lower(coalesce(v_status, '')) <> 'completed' then
    raise exception 'Helpr Happiness can be requested after the job is completed';
  end if;

  if v_payment_status is distinct from 'paid' then
    raise exception 'Helpr Happiness is only for booked jobs that were paid in the app';
  end if;

  v_anchor := coalesce(v_completed_at, v_created_at);
  if v_anchor is null or v_anchor + interval '30 days' < now() then
    raise exception 'The 30-day request window for this job has closed';
  end if;

  new.service_provider_id := v_provider_id;
  new.status := 'submitted';
  new.outcome := null;
  new.amount_approved_cents := null;
  new.payout_method := null;
  new.stripe_refund_id := null;
  new.decision_notes := null;
  new.resolved_at := null;
  new.resolved_by := null;
  new.narrative := trim(new.narrative);
  new.evidence_notes := trim(new.evidence_notes);
  new.updated_at := now();

  return new;
end;
$$;

revoke all on function helpr_private.enforce_happiness_claim_write() from public, anon;
grant execute on function helpr_private.enforce_happiness_claim_write() to authenticated, service_role;

drop trigger if exists helpr_happiness_claim_write on public.helpr_happiness_claim;

create trigger helpr_happiness_claim_write
  before insert or update on public.helpr_happiness_claim
  for each row
  execute function helpr_private.enforce_happiness_claim_write();

alter table public.helpr_happiness_claim enable row level security;

drop policy if exists helpr_happiness_claim_select_own on public.helpr_happiness_claim;
create policy helpr_happiness_claim_select_own
  on public.helpr_happiness_claim
  for select
  to authenticated
  using (customer_id = (select auth.uid())::text);

drop policy if exists helpr_happiness_claim_insert_own on public.helpr_happiness_claim;
create policy helpr_happiness_claim_insert_own
  on public.helpr_happiness_claim
  for insert
  to authenticated
  with check (customer_id = (select auth.uid())::text);

revoke all on public.helpr_happiness_claim from public, anon;
grant select, insert on public.helpr_happiness_claim to authenticated;
grant all on public.helpr_happiness_claim to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'happiness-claim-evidence',
  'happiness-claim-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists helpr_happiness_evidence_insert_own on storage.objects;
create policy helpr_happiness_evidence_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'happiness-claim-evidence'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );

drop policy if exists helpr_happiness_evidence_select_own on storage.objects;
create policy helpr_happiness_evidence_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'happiness-claim-evidence'
    and owner_id = (select auth.uid())::text
  );
