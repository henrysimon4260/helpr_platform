# Job contract

The only artifact both apps and both sessions agree on. Not a package and not runnable code. The lane that introduces a change writes it here before either app consumes it. Nobody invents a status, column, or function payload in a screen file.

Lane rules: [`AGENTS.md`](AGENTS.md).

## `service.status`

Use these spellings exactly. Do not substitute aliases (`helpr_otw`, not `on_the_way` or `Helpr_Otw` on write).

| Status | Who may write it | When |
| --- | --- | --- |
| `finding_pros` | Customer app (A on insert). Provider app (C) when a confirmed provider cancels and returns the job to the open feed. | New job. Also the current provider-cancel path (clears `service_provider_id`). |
| `pending` | Legacy / unused on write. Provider feed still reads it. | Do not start writing this for new work. |
| `scheduled` | Legacy / unused on write. Provider feed still reads it. Distinct from `scheduling_type: 'scheduled'`. | Do not start writing this for new work. |
| `select_service_provider` | Provider app (C) | First non-AutoFill bid while status is `finding_pros`. |
| `confirmed` | Customer app (B) on select-a-pro. Provider app (C) on AutoFill claim. | Assigns `service_provider_id`, copies bid into `price`, copies `proposed_date_time` into `scheduled_date_time` when present. |
| `helpr_otw` | Provider app (C) | From `confirmed` via Service Details (“I'm on the way”). |
| `in_progress` | Provider app (C) | From `helpr_otw` via Service Details (“Start Service”). |
| `completed` | Edge function `complete-service` (invoked by C). | From `in_progress` (“Complete Service”). The function writes this status after capture/transfer. |

There is no `cancelled` status yet. Do not add one in a screen. Agent B specifies it here first (who may set it, from which statuses, and how the other app treats those rows). Then C implements against that paragraph.

### Machine

`finding_pros` / `pending` / `scheduled` → `select_service_provider` → `confirmed` → `helpr_otw` → `in_progress` → `completed`

## `service_fill_request`

A bid / interest row. One provider per service until deleted.

| Field | Meaning |
| --- | --- |
| `service_id` | Job being bid on. |
| `service_provider_id` | Bidding provider. |
| `bid` | Dollar amount the provider is offering. Becomes `service.price` on confirm. |
| `proposed_date_time` | Required for ASAP (or when the provider proposes a time). Copied to `service.scheduled_date_time` on confirm. Null when the job is already scheduled and no new time is proposed. |

**Insert:** Provider (C) when requesting a job. AutoFill jobs still insert a row, then immediately assign or roll back.

**Accept:** Customer (B) selects a provider, or C AutoFill wins the claim. On accept: set `service` to `confirmed`, copy `bid` / `proposed_date_time`, then delete **all** fill requests for that `service_id`.

**Delete:**

- All rows for the service, after customer select-a-pro or successful AutoFill.
- That provider’s row, if AutoFill loses the race or assignment fails.
- That provider’s row, if the assigned provider cancels a confirmed job (C also sets status back to `finding_pros` and clears `service_provider_id` — until B specifies a real `cancelled` status).

## Ratings

| Table | Who writes | Meaning |
| --- | --- | --- |
| `service_provider_ratings` | Customer app (B) | Customer rates the pro. |
| `customer_ratings` | Provider app (C) | Pro rates the customer. |

Shared columns used today: `id`, `service_id`, `customer_id`, `service_provider_id`, `rating` (1–5), `comment` (nullable). Upsert by existing `id` for that service pair; do not insert a second row.

## Edge functions

Bodies live under `apps/serviceprovider-app/supabase/functions/` (Agent E). Call sites stay with B and C.

`create-payment-intent` and `complete-service` are deployed (ACTIVE) and checked into `apps/serviceprovider-app/supabase/functions/`. Do not change request/response shapes in a screen first.

Other live functions (`save-payment-method`, Plaid/ACH, `sync-stripe-balance`, …) are still deploy-only until a later E feature checks them in.

### `create-payment-intent`

Invoked by customer `select-helpr.tsx` (B). Source: `apps/serviceprovider-app/supabase/functions/create-payment-intent/index.ts`.

**Request:**

```json
{
  "amount": 0,
  "currency": "usd",
  "payment_method_id": "",
  "service_id": "",
  "customer_id": "",
  "customer_email": ""
}
```

`amount` is integer cents. `customer_email` is optional if `customer_id` can be resolved.

**Response:** `{ "clientSecret", "status", "paymentIntentId" }`

B treats `status === 'succeeded'` as already confirmed, or uses `clientSecret` for PaymentSheet, then writes `confirmed` and `payment_status: 'paid'`.

**Error:** `{ "error": "" }`

### `complete-service`

Invoked by provider `ServiceDetails.tsx` (C) when advancing `in_progress` → `completed`. Source: `apps/serviceprovider-app/supabase/functions/complete-service/index.ts`. Writer of `service.status = 'completed'`.

**Request:**

```json
{
  "serviceId": "",
  "platformFeePercent": 0.15,
  "skipCustomerCharge": true
}
```

`platformFeePercent` and `skipCustomerCharge` are accepted by the client today; the deployed body requires an existing paid `payment_intent_id` and uses its own fee math (1% platform + 2.9% + $0.30).

**Success:** `{ "success": true, "provider_amount": 0, "new_balance": 0, ... }`

**Error:** `{ "success": false, "error": "" }` (HTTP 200 so the client can read it) or a functions invoke error. C must not invent a different completion path without updating this contract.

### `create-connect-account`

Exists. Signup / provider profile (D) may call it; only E rewrites it.

**Request (both casings accepted):** `email`, `firstName` / `first_name`, `lastName` / `last_name`, `refreshUrl` / `refresh_url`, `returnUrl` / `return_url`.

**Success:** `{ "success": true, "accountId" | "account_id", "onboardingUrl" | "onboarding_url" }`

## Job chat and alerts (HLP-31)

Customer and assigned provider only. No group thread and no support bot in this thread.

Chat is open only when `service.service_provider_id` is set and `service.status` is `confirmed`, `helpr_otw`, `in_progress`, or `completed`. `finding_pros`, `pending`, `scheduled`, and `select_service_provider` have no chat. After a provider cancel returns the job to `finding_pros` and clears `service_provider_id`, the thread locks again. A later assignment starts a new thread: messages are stored with the provider id from send time, and reads require that id to still be the assigned provider.

There is no `arrived` status. The arrived / start alert uses the existing `in_progress` write.

### `job_messages`

| Column | Meaning |
| --- | --- |
| `service_id` | Job. |
| `service_provider_id` | Assigned provider at send time. |
| `sender_role` | `customer` or `provider`. |
| `sender_id` | `customer.customer_id` or `service_provider.service_provider_id` (`auth.uid()` for providers). |
| `body` | 1–2000 characters. |

**Insert:** the customer who owns the job, or the assigned provider, while chat is open.

### `job_notifications`

The in-app alert. This row is the real send. Push is a second attempt recorded on the same row.

| Column | Meaning |
| --- | --- |
| `kind` | `message`, `cancel`, or `status`. |
| `recipient_role` / `recipient_id` | The other party. |
| `actor_role` / `actor_id` | Who caused the alert. |
| `status_value` | For `status`: `helpr_otw`, `in_progress`, or `completed`. For provider cancel: `finding_pros`. |
| `push_status` | `pending`, `sent`, `degraded`, or `failed`. Clients insert `pending` only. |
| `push_error` | Machine reason when push did not send. `expo_access_token_missing` and `no_push_token` are degraded, not success. |
| `read_at` | Set when the recipient opens the job thread or the alert. |

**Insert:** assigned provider may alert the customer for `message`, `status`, or `cancel` while chat is still open (cancel is written before `service_provider_id` is cleared). Customer may alert the provider for `message` only. Unread cancel rows can be deleted by that provider if the cancel update then fails.

### `device_push_tokens`

One Expo push token per owner. Owners read and write only their own rows. Other clients cannot read tokens.

### `notify-job`

Edge function. Source: `apps/serviceprovider-app/supabase/functions/notify-job/index.ts`. Call it after the `job_notifications` insert. It does not create the alert row.

**Request:** `{ "notificationId": "" }` with the caller’s Supabase JWT.

**Response:**

```json
{ "inApp": true, "pushDelivered": false, "pushStatus": "degraded", "reason": "expo_access_token_missing" }
```

`pushDelivered` is true only when Expo returns a ticket with `status: "ok"` and `EXPO_ACCESS_TOKEN` is set. Missing token, missing device token, or a non-ok ticket stays `pushDelivered: false`.

Copy in the apps must use that flag. Do not tell the other party they were notified when `pushDelivered` is false. In-app badge copy is the degrade path.

Provider cancel (C, `landing.tsx`) and provider status buttons (C, `ServiceDetails.tsx`: `helpr_otw`, `in_progress`, `completed`) go through `recordJobNotice` in `src/lib/jobChat.ts`, which inserts the alert and invokes `notify-job`. Customer and provider message sends use the same function.

## Adding something new

Write it in this file first:

1. New `service.status` value — spelling, who writes it, from which statuses, how the other app treats those rows.
2. New `service` / `service_fill_request` / ratings column or table.
3. New or changed edge-function request/response.

Then implement the primary app, then a later session on the other app.
