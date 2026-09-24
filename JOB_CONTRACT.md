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

`delete-payment-method` and `create-payout` are checked in under `supabase/functions/`. `save-payment-method`, Plaid/ACH, and `sync-stripe-balance` are still deploy-only. Plaid is not wired in the customer app.

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

### `delete-payment-method`

Invoked by the customer account payment modal (E). Source: `apps/serviceprovider-app/supabase/functions/delete-payment-method/index.ts`.

Requires the signed-in user's JWT (`verify_jwt = true` plus `auth.getUser`). Detaches the caller's Stripe PaymentMethod and deletes that user's `payment_methods` row (`user_id` = auth user id, `stripe_pm_id` = Stripe id).

There is no database constraint linking a saved card to a job. The function still fails closed when:

- this PaymentMethod is on an in-flight paid job's PaymentIntent in `requires_capture`, `requires_confirmation`, `requires_action`, or `processing`, or
- it is the only saved card and the customer has a `service` with `payment_status = 'paid'` and status `confirmed`, `helpr_otw`, or `in_progress`.

If the jobs lookup fails, nothing is detached.

**Request:** `{ "payment_method_id": "" }` — `payment_methods.id`, or a `pm_…` Stripe id.

**Success:** `{ "success": true, "deleted_id": "" }`

**Error:** `{ "success": false, "error": "", "code"?: "payment_in_progress" | "only_card_in_flight" | "db_delete_failed" }`. Auth failures use HTTP 401. Other results use HTTP 200 so the client can read `error`.

Does not change capture timing, fees, or tax.

### `create-payout`

Invoked by the provider account Withdraw button (E). Source: `apps/serviceprovider-app/supabase/functions/create-payout/index.ts`.

Requires the signed-in provider's JWT. Pays out available Stripe Connect balance to the connected account's default bank via `payouts.create` (`method: standard`) on that Custom account. No new fee. Platform fee stays the existing customer charge (3% processing + 1% platform in select-a-pro). This function does not capture, transfer, or change MCC.

The amount is the Stripe available balance for one source type (card first, because Connect transfers land as card). It is not a percentage of `service_provider.balance`. After a successful payout the function subtracts that amount from `service_provider.balance` (floor at 0).

If the Connect account or bank is missing, or `payouts_enabled` is false, no payout is created. When Stripe can issue an account link, the response includes `onboarding_url` (same `stripe-redirect` helper as `create-connect-account`). If there is no `stripe_account_id`, the response is `connect_account_missing` with no link.

**Request:**

```json
{
  "amount_cents": null,
  "refresh_url": "",
  "return_url": ""
}
```

`amount_cents` is optional. Omit it to withdraw the available source balance. `refresh_url` / `return_url` are optional app deep links used only when building an account link. The function generates its own Stripe idempotency key per request.

**Success:** `{ "success": true, "payout_id": "", "amount": 0, "amount_cents": 0, "currency": "usd", "status": "", "arrival_date": null, "new_balance": 0, "message": "" }`

If the payout succeeded but the balance row did not update: `balance_update_failed: true` and no `new_balance`.

**Error:** `{ "success": false, "error": "", "code"?: "bank_account_missing" | "connect_account_missing" | "funds_pending" | "nothing_available" | "amount_invalid" | "provider_not_found", "onboarding_url"?: "" }`

Plaid / ACH is not wired. There is no Plaid key or product decision in this repo. The customer payment modal must not report a bank account as saved.

## Adding something new

Write it in this file first:

1. New `service.status` value — spelling, who writes it, from which statuses, how the other app treats those rows.
2. New `service` / `service_fill_request` / ratings column or table.
3. New or changed edge-function request/response.

Then implement the primary app, then a later session on the other app.
