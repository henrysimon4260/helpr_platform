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

## Identity

Both apps share one Supabase Auth project. The login identifier is the auth user's email.

| Record | Match | Notes |
| --- | --- | --- |
| `customer` | `email` equals the auth email, case-insensitive. `customer_id` is not the auth uid. | More than one row for that email stops deletion. |
| `service_provider` | `service_provider_id` equals the auth uid. | A row with the same email and a different id is not this login. Deletion stops instead of removing it. |

Create-time fields stay as they are: customer `first_name`, `last_name`, `email`, optional `phone_number`; provider `service_provider_id`, `first_name`, `last_name`, `email`, optional `phone`.

## `delete-account`

Source: `apps/serviceprovider-app/supabase/functions/delete-account/index.ts`. Called by customer `(home)/account.tsx` and provider `app/account.tsx` after a destructive confirm. JWT required (`verify_jwt = true`). The function checks that bearer token with the Auth server, then uses the service role. It does not capture, refund, transfer, or pay out, and it does not change fee or tax math.

**Request:** `{ "confirm": true }`

**Success (200):**

```json
{
  "success": true,
  "deleted": {
    "auth_user": "deleted",
    "customer_profile": "deleted | anonymized | none",
    "provider_profile": "deleted | anonymized | none",
    "payment_method_rows": 0,
    "stripe_customers": 0,
    "stripe_connect_account": "deleted | none",
    "open_services": 0
  }
}
```

**Blocked (409):** `{ "success": false, "error": "", "code": "open_jobs | unpaid_obligation | unresolved_job | provider_balance | stripe_connect | profile_conflict | no_email" }`

**Other:** `401 unauthorized`, `400 confirmation_required`, `500 delete_failed | not_configured`.

### Fail closed (no writes yet)

- `service.status` is `confirmed`, `helpr_otw`, or `in_progress` (`open_jobs`).
- A non-`completed` service has `payment_intent_id` set or `payment_status = 'paid'` (`unpaid_obligation`). On confirm, `paid` means a PaymentIntent exists. Capture still happens only in `complete-service`.
- Any other status (`unresolved_job`).
- `service_provider.balance` is non-zero, or the Connect account's Stripe available or pending balance is non-zero (`provider_balance`). No payout is created.
- `accounts.del` is rejected (`stripe_connect`). This platform creates Custom accounts, which Stripe lets the platform delete only when the balance is zero. A refusal stops the whole request.

Open requests with no payment signal may be removed: `finding_pros`, `pending`, `scheduled`, `select_service_provider`.

### Deleted

- Auth user, hard delete via `auth.admin.deleteUser`, after `signOut(jwt, 'global')`. Sessions and refresh tokens are removed. An access JWT already issued stays valid until `exp`. The apps then clear the local session.
- `payment_methods` rows for the auth uid and the matched profile ids. Saved card ids are detached in Stripe.
- Stripe Customers whose email is the auth email or the matched profile email. Stripe still keeps charge history for a deleted customer and still returns the deleted customer object.
- Connect Custom account via `accounts.del` when Stripe allows it.
- That customer's open services, their fill requests, and ratings on those services.
- This provider's `service_fill_request` rows.
- `service_provider_ratings` and `customer_ratings` rows that reference this customer or provider.
- Objects under `profile-pictures/providers/<id>/`.
- On the customer's `completed` services: `description`, `start_location`, `end_location`, and `location` cleared.

### Soft-deleted

The profile row is anonymized (`Deleted` / `Account`, email `deleted+<id>@users.invalid`, phone cleared; provider photo and `stripe_account_id` cleared) when a `completed` service or a `platform_transactions` row still references it, or when a hard delete hits a foreign key. The ledger row stays. The name, email, and phone do not.

### Left in place

- `platform_transactions`.
- `completed` service rows: price, status, `payment_intent_id`, `payment_status`.
- Stripe charge, transfer, and payout records.
- Fee math, tax, and capture.

### Deploy

No migration. From `apps/serviceprovider-app`, with the existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `STRIPE_SECRET_KEY` secrets:

`supabase functions deploy delete-account`

## Adding something new

Write it in this file first:

1. New `service.status` value — spelling, who writes it, from which statuses, how the other app treats those rows.
2. New `service` / `service_fill_request` / ratings column or table.
3. New or changed edge-function request/response.

Then implement the primary app, then a later session on the other app.
