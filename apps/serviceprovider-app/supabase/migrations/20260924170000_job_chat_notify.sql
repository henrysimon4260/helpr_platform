-- HLP-31 job chat + in-app alerts + push token storage.
-- Apply in the Supabase SQL editor or with `supabase db push` from apps/serviceprovider-app
-- after `supabase link`. service_id is uuid, matching client inserts from crypto.randomUUID().
-- If public.service.service_id is not uuid, change the service_id columns below to that type
-- before applying. Do not invent a new service.status. in_progress is the arrived/start step.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.jwt_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function private.current_customer_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.customer_id::text
  from public.customer c
  where lower(c.email) = private.jwt_email()
    and private.jwt_email() <> ''
  limit 1;
$$;

create or replace function private.service_customer_id(p_service_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.customer_id::text
  from public.service s
  where s.service_id = p_service_id
  limit 1;
$$;

create or replace function private.service_provider_id(p_service_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.service_provider_id::text
  from public.service s
  where s.service_id = p_service_id
  limit 1;
$$;

create or replace function private.service_chat_open(p_service_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.service s
    where s.service_id = p_service_id
      and s.service_provider_id is not null
      and lower(s.status) in ('confirmed', 'helpr_otw', 'in_progress', 'completed')
  );
$$;

create or replace function private.caller_owns_service(p_service_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.service_customer_id(p_service_id) is not null
    and private.service_customer_id(p_service_id) = private.current_customer_id();
$$;

revoke all on function private.jwt_email() from public;
revoke all on function private.current_customer_id() from public;
revoke all on function private.service_customer_id(uuid) from public;
revoke all on function private.service_provider_id(uuid) from public;
revoke all on function private.service_chat_open(uuid) from public;
revoke all on function private.caller_owns_service(uuid) from public;

grant execute on function private.jwt_email() to authenticated, service_role;
grant execute on function private.current_customer_id() to authenticated, service_role;
grant execute on function private.service_customer_id(uuid) to authenticated, service_role;
grant execute on function private.service_provider_id(uuid) to authenticated, service_role;
grant execute on function private.service_chat_open(uuid) to authenticated, service_role;
grant execute on function private.caller_owns_service(uuid) to authenticated, service_role;

create table if not exists public.job_messages (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.service (service_id) on delete cascade,
  service_provider_id text not null,
  sender_role text not null check (sender_role in ('customer', 'provider')),
  sender_id text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint job_messages_body_len check (char_length(btrim(body)) between 1 and 2000)
);

create index if not exists job_messages_service_created_idx
  on public.job_messages (service_id, created_at);

create table if not exists public.job_notifications (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.service (service_id) on delete cascade,
  recipient_role text not null check (recipient_role in ('customer', 'provider')),
  recipient_id text not null,
  actor_role text not null check (actor_role in ('customer', 'provider')),
  actor_id text not null,
  kind text not null check (kind in ('message', 'cancel', 'status')),
  title text not null,
  body text not null,
  status_value text,
  message_id uuid references public.job_messages (id) on delete set null,
  push_status text not null default 'pending' check (push_status in ('pending', 'sent', 'degraded', 'failed')),
  push_error text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint job_notifications_status_value check (
    status_value is null
    or status_value in ('helpr_otw', 'in_progress', 'completed', 'finding_pros')
  )
);

create index if not exists job_notifications_recipient_idx
  on public.job_notifications (recipient_role, recipient_id, created_at desc);

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_role text not null check (owner_role in ('customer', 'provider')),
  owner_id text not null,
  expo_push_token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  unique (owner_role, owner_id, expo_push_token)
);

alter table public.job_messages enable row level security;
alter table public.job_notifications enable row level security;
alter table public.device_push_tokens enable row level security;

grant select, insert on public.job_messages to authenticated;
grant select, insert, update, delete on public.job_notifications to authenticated;
grant select, insert, update, delete on public.device_push_tokens to authenticated;

drop policy if exists job_messages_select_parties on public.job_messages;
create policy job_messages_select_parties
  on public.job_messages
  for select
  to authenticated
  using (
    private.service_chat_open(service_id)
    and service_provider_id = private.service_provider_id(service_id)
    and (
      private.caller_owns_service(service_id)
      or service_provider_id = auth.uid()::text
    )
  );

drop policy if exists job_messages_insert_parties on public.job_messages;
create policy job_messages_insert_parties
  on public.job_messages
  for insert
  to authenticated
  with check (
    private.service_chat_open(service_id)
    and service_provider_id = private.service_provider_id(service_id)
    and char_length(btrim(body)) between 1 and 2000
    and (
      (
        sender_role = 'customer'
        and sender_id = private.current_customer_id()
        and private.caller_owns_service(service_id)
      )
      or (
        sender_role = 'provider'
        and sender_id = auth.uid()::text
        and sender_id = private.service_provider_id(service_id)
      )
    )
  );

drop policy if exists job_notifications_select_recipient on public.job_notifications;
create policy job_notifications_select_recipient
  on public.job_notifications
  for select
  to authenticated
  using (
    (
      recipient_role = 'provider'
      and recipient_id = auth.uid()::text
    )
    or (
      recipient_role = 'customer'
      and recipient_id = private.current_customer_id()
    )
  );

drop policy if exists job_notifications_insert_actor on public.job_notifications;
create policy job_notifications_insert_actor
  on public.job_notifications
  for insert
  to authenticated
  with check (
    (
      actor_role = 'provider'
      and actor_id = auth.uid()::text
      and recipient_role = 'customer'
      and recipient_id = private.service_customer_id(service_id)
      and private.service_chat_open(service_id)
      and private.service_provider_id(service_id) = auth.uid()::text
      and kind in ('message', 'status', 'cancel')
      and push_status = 'pending'
      and (
        kind <> 'status'
        or status_value in ('helpr_otw', 'in_progress', 'completed')
      )
    )
    or (
      actor_role = 'customer'
      and actor_id = private.current_customer_id()
      and recipient_role = 'provider'
      and recipient_id = private.service_provider_id(service_id)
      and private.service_chat_open(service_id)
      and kind = 'message'
      and push_status = 'pending'
    )
  );

drop policy if exists job_notifications_mark_read on public.job_notifications;
create policy job_notifications_mark_read
  on public.job_notifications
  for update
  to authenticated
  using (
    (
      recipient_role = 'provider'
      and recipient_id = auth.uid()::text
    )
    or (
      recipient_role = 'customer'
      and recipient_id = private.current_customer_id()
    )
  )
  with check (
    (
      recipient_role = 'provider'
      and recipient_id = auth.uid()::text
    )
    or (
      recipient_role = 'customer'
      and recipient_id = private.current_customer_id()
    )
  );

drop policy if exists job_notifications_retract_cancel on public.job_notifications;
create policy job_notifications_retract_cancel
  on public.job_notifications
  for delete
  to authenticated
  using (
    read_at is null
    and kind = 'cancel'
    and actor_role = 'provider'
    and actor_id = auth.uid()::text
  );

drop policy if exists device_push_tokens_own on public.device_push_tokens;
create policy device_push_tokens_own
  on public.device_push_tokens
  for all
  to authenticated
  using (
    (
      owner_role = 'provider'
      and owner_id = auth.uid()::text
    )
    or (
      owner_role = 'customer'
      and owner_id = private.current_customer_id()
    )
  )
  with check (
    (
      owner_role = 'provider'
      and owner_id = auth.uid()::text
    )
    or (
      owner_role = 'customer'
      and owner_id = private.current_customer_id()
    )
  );

create or replace function private.freeze_notification_delivery_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role'
    or current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  new.push_status := old.push_status;
  new.push_error := old.push_error;
  new.kind := old.kind;
  new.title := old.title;
  new.body := old.body;
  new.recipient_id := old.recipient_id;
  new.recipient_role := old.recipient_role;
  new.actor_id := old.actor_id;
  new.actor_role := old.actor_role;
  new.service_id := old.service_id;
  new.status_value := old.status_value;
  new.message_id := old.message_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

revoke all on function private.freeze_notification_delivery_fields() from public;
grant execute on function private.freeze_notification_delivery_fields() to authenticated, service_role;

drop trigger if exists job_notifications_freeze_delivery on public.job_notifications;
create trigger job_notifications_freeze_delivery
  before update on public.job_notifications
  for each row
  execute function private.freeze_notification_delivery_fields();

do $$
begin
  alter publication supabase_realtime add table public.job_messages;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.job_notifications;
exception
  when duplicate_object then null;
end $$;
