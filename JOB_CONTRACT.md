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

## Checkr background check (HLP-50)

Stripe Connect KYC is payout identity only. It does not clear a provider to accept work. Checkr does.

`consider` fails closed. A consider, suspended, expired, canceled, pending, or missing report cannot accept paid work and does not show a customer verified badge. `report.engaged` does not promote a consider result to clear. There is no in-app override.

### `service_provider` Checkr columns

Written only by the service role inside `create-checkr-invitation` and `checkr-webhook`. Client updates are rejected by `private.protect_service_provider_checkr_fields`. Do not set `checkr_status` to `clear` in the dashboard or a seed. A clear value is valid only after a Checkr `report.completed` (or equivalent report payload) whose `result` is `clear` and whose `assessment` is not `review` or `escalated`.

| Column | Meaning |
| --- | --- |
| `checkr_candidate_id` | Checkr candidate id. |
| `checkr_invitation_id` | Latest hosted-apply invitation id. |
| `checkr_report_id` | Latest report id. |
| `checkr_invitation_url` | Hosted apply URL for the current invitation. |
| `checkr_invitation_expires_at` | Invitation expiry from Checkr (invitations last 7 days). |
| `checkr_package` | Package slug sent to Checkr (`CHECKR_PACKAGE`). |
| `checkr_work_state` | US state used as the Checkr work location. |
| `checkr_last_event` | Last webhook or invite event name. |
| `checkr_status_updated_at` | When `checkr_status` last changed. |
| `checkr_status` | One of the spellings below. Default `not_started`. |

| `checkr_status` | Who writes it | Go-live |
| --- | --- | --- |
| `not_started` | Default. Invite function has not created a candidate yet. | Blocked. |
| `pending` | Invite function after a candidate + invitation. Webhook on `invitation.*` (except expired/deleted), `report.created`, `report.resumed`. | Blocked. |
| `clear` | Webhook only, from a report `result` of `clear`. | Allowed. |
| `consider` | Webhook. Report `result` of `consider`, missing result on a completed report, dispute, adverse action, or assessment `review` / `escalated`. | Blocked. |
| `suspended` | Webhook `report.suspended` or report `status` `suspended`. | Blocked. |
| `expired` | Webhook `invitation.expired`. Also the in-app copy when a pending invitation's `checkr_invitation_expires_at` is past. | Blocked. |
| `canceled` | Webhook `invitation.deleted` or report `status` `canceled`. | Blocked. |

Existing rows gain `checkr_status = 'not_started'` when the migration runs. They stay off the open-job feed until a real Checkr clear. That is intentional.

### Go-live rule

A provider may insert `service_fill_request` or be assigned on `service.service_provider_id` only when `checkr_status = 'clear'`. Enforced in the database by `private.enforce_checkr_clear_on_fill_request` and `private.enforce_checkr_clear_on_assignment`. The provider app also hides the open-job feed and blocks the request button. The customer app shows a verified badge only for `clear`, and will not select a pro who is not clear.

In-progress jobs already assigned stay visible to that provider so a live job is not stranded. New bids and new assignments still fail. `complete-service` is unchanged.

Customer copy says "Verified" only. It does not list Checkr status names.

### `create-checkr-invitation`

Source: `apps/serviceprovider-app/supabase/functions/create-checkr-invitation/index.ts`. Called by the provider app with the user JWT. Creates or reuses a Checkr candidate (`custom_id` = `service_provider_id`), then creates a hosted invitation. Does not collect SSN in Helpr.

**Request:**

```json
{ "work_state": "CA", "work_city": "" }
```

`work_state` is a US postal abbreviation. `work_city` is optional. `workState` / `workCity` are accepted aliases.

**Success:** `{ "success": true, "checkr_status": "pending", "invitation_url": "", "invitation_id": "", "candidate_id": "", "expires_at": "" }`

Already clear: `{ "success": true, "checkr_status": "clear", "invitation_url": null }`

**Blocked self-serve retry:** `consider` and `suspended` return HTTP 409 `{ "success": false, "error": "" }`. The provider must contact support. Expired, canceled, and not-started may start a new invitation.

**Not configured:** HTTP 503 `{ "success": false, "error": "Checkr is not configured. Set CHECKR_API_KEY and CHECKR_PACKAGE." }` The function must not invent a clear status.

### `checkr-webhook`

Source: `apps/serviceprovider-app/supabase/functions/checkr-webhook/index.ts`. Public (no Supabase JWT). Checkr signs the raw body with HMAC-SHA256. The function accepts the hex digest in `X-Checkr-Signature` (also `v1=` if present). The HMAC key is `CHECKR_WEBHOOK_SECRET`, or `CHECKR_API_KEY` when the secret is unset (standard Checkr accounts sign with the API key; partner apps sign with the client secret — store that in `CHECKR_WEBHOOK_SECRET`).

Invalid signatures return HTTP 401. A verified event for an unknown candidate returns HTTP 200 so Checkr stops retrying, and writes nothing.

Updates the provider row matched by `checkr_candidate_id`, then `custom_id` / `service_provider_id`, then `checkr_report_id`.

## Adding something new

Write it in this file first:

1. New `service.status` value — spelling, who writes it, from which statuses, how the other app treats those rows.
2. New `service` / `service_fill_request` / ratings column or table.
3. New or changed edge-function request/response.

Then implement the primary app, then a later session on the other app.
