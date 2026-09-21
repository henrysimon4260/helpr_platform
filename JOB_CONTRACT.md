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
| `confirmed` | Customer app (B) on select-a-pro. Provider app (C) on AutoFill claim. | Assigns `service_provider_id`, copies bid into `price`, copies `proposed_date_time` into `scheduled_date_time` when present. AutoFill may write `confirmed` only in the same update as `payment_status: 'paid'` and `payment_intent_id`, after `create-payment-intent` returns `succeeded`. No saved card or a failed charge leaves the job unconfirmed. |
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

**Accept:** Customer (B) selects a provider, or C AutoFill wins the claim. On accept: set `service` to `confirmed`, copy `bid` / `proposed_date_time`, then delete **all** fill requests for that `service_id`. AutoFill charges first via `create-payment-intent` (`use_saved_payment_method: true`). The winning claim update also writes `payment_status: 'paid'` and `payment_intent_id`. If the charge fails, or the claim loses the race, the job is not confirmed and that provider’s fill request is removed. A lost race refunds or cancels the PaymentIntent through `void-unclaimed-payment`.

**Delete:**

- All rows for the service, after customer select-a-pro or successful AutoFill.
- That provider’s row, if AutoFill loses the race, the charge fails, or assignment fails. A lost race also voids the PaymentIntent created for that claim.
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

Invoked by customer `select-helpr.tsx` (B) and, for AutoFill, by provider `landing.tsx`. Source: `apps/serviceprovider-app/supabase/functions/create-payment-intent/index.ts`.

**Request:**

```json
{
  "amount": 0,
  "currency": "usd",
  "payment_method_id": "",
  "service_id": "",
  "customer_id": "",
  "customer_email": "",
  "use_saved_payment_method": false
}
```

`amount` is integer cents. `customer_email` is optional if `customer_id` can be resolved.

Customer select-a-pro sends `amount`, `payment_method_id`, `service_id`, and `customer_id`. `use_saved_payment_method` stays omitted or false. On that path the function still confirms the PaymentIntent and, when `service_id` is present, writes `payment_intent_id` onto the `service` row. It does not set `payment_status` or `service.status`.

**AutoFill (`use_saved_payment_method: true`):** provider `landing.tsx` calls this after inserting the fill request. Omit `amount` and `payment_method_id`. Required: `service_id`, `customer_id`, and the provider's JWT. The function checks the job is still open AutoFill (`finding_pros` or `select_service_provider`, no `service_provider_id`), reads that provider's fill-request `bid`, and charges the same total as select-helpr (bid + 3% processing + 1% platform, in cents). It loads the customer's saved card from `payment_methods` (auth user for `customer.email`, else `customer_id`) and confirms off-session. It returns success only when `status` is `succeeded`. Any other status is canceled and returned as an error. This path does **not** write `payment_intent_id`; the winning claim update is the writer.

**Response:** `{ "clientSecret", "status", "paymentIntentId" }`

Customer `select-helpr.tsx` treats `status === 'succeeded'` as already confirmed, or uses `clientSecret` for PaymentSheet, then writes `confirmed` and `payment_status: 'paid'`. On that path the function has already stored `payment_intent_id`. Provider AutoFill writes `confirmed`, `payment_status: 'paid'`, and `payment_intent_id` together, and only after `status === 'succeeded'` and a non-empty `paymentIntentId`. AutoFill does not mark the row confirmed or paid when the PaymentIntent id is missing.

**Error:** `{ "error": "" }`

### `void-unclaimed-payment`

Invoked by provider `landing.tsx` when an AutoFill charge succeeded but the claim update did not win. Source: `apps/serviceprovider-app/supabase/functions/void-unclaimed-payment/index.ts`.

**Request:** `{ "paymentIntentId": "", "service_id": "" }`

Refunds a succeeded PaymentIntent, or cancels one that is not captured, only when Stripe metadata `service_id` matches and `service.payment_intent_id` is not already that id on a workable status (`confirmed`, `helpr_otw`, `in_progress`, `completed`). If the unconfirmed row still holds this id, it is cleared.

**Success:** `{ "voided": true }`

**Error:** `{ "voided": false, "error": "" }`

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

## Adding something new

Write it in this file first:

1. New `service.status` value — spelling, who writes it, from which statuses, how the other app treats those rows.
2. New `service` / `service_fill_request` / ratings column or table.
3. New or changed edge-function request/response.

Then implement the primary app, then a later session on the other app.
