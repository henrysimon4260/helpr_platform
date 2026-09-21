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

**Auth (both paths):** `Authorization: Bearer <user access token>`. `supabase.functions.invoke` from a signed-in client sends this. The handler calls `auth.getUser(jwt)` and does not trust `user_metadata`. Missing or invalid token → **401**. Missing server configuration → **500**. No charge is created. `verify_jwt` stays true for this function.

**Request:**

```json
{
  "amount": 0,
  "currency": "usd",
  "payment_method_id": "",
  "service_id": "",
  "customer_id": "",
  "customer_email": "",
  "service_provider_id": "",
  "use_saved_payment_method": false
}
```

`amount`, when sent, is integer cents. It is checked against the server total. It is never the amount Stripe is asked to charge. `currency` must be omitted or `usd`. `customer_email` is optional and, if sent, must match the customer row. `service_provider_id` is optional; select-helpr does not send it yet.

Customer select-a-pro sends `amount`, `payment_method_id`, `service_id`, and `customer_id`, and the signed-in customer's JWT. `use_saved_payment_method` stays omitted or false.

**Customer confirm authorization:**

- `service_id` is required. The service row must exist.
- The JWT user must own that service: `auth.users.id` equals `service.customer_id`, or the auth user's email matches `customer.email` for that `service.customer_id` (case-insensitive). Otherwise **403**.
- Client `customer_id`, if sent, must equal `service.customer_id`. The charge uses the service's customer id and that row's email. A client email or customer id is not a way to point the charge at someone else. Mismatch → **400**.
- `payment_method_id` must be a `payment_methods.stripe_pm_id` whose `user_id` is the auth user or that `customer_id`. On Stripe, the PaymentMethod must be unattached or already attached to the Stripe customer for that booking email. Otherwise **403**. A new charge is not created.
- Amount is computed on the server with the same cents rule as today (`bookingChargeCents`: base + 3% processing + 1% platform). While any fill request has a usable `bid`, that bid is the base — not `service.price`, which is still the customer's estimate until accept copies the bid. If the client sends `amount`, it must equal one of those server totals or the call is **400** and nothing is charged. If several bids produce different totals, the client `amount` or `service_provider_id` has to select exactly one; otherwise **400**. After accept, when fill requests are gone, `service.price` is the copied bid and a retry uses `bookingChargeCents(service.price)`.
- A new PaymentIntent is created only while the job is open and unassigned (`finding_pros`, `pending`, `scheduled`, or `select_service_provider`, and no `service_provider_id`). A later call for an assigned or already-confirmed job returns the stored PaymentIntent when it is reusable and the server amount matches. It does not create another charge.
- There is no charge without a `service_id`.

On that path the function still confirms the PaymentIntent and writes `payment_intent_id` onto the `service` row. It does not set `payment_status` or `service.status`. The write is retried. It only fills `payment_intent_id` when the column is empty or already that id. If a different reusable PaymentIntent is already stored, the extra PaymentIntent is refunded or canceled and the stored id is returned. If the service row is gone after the charge, the PaymentIntent is refunded or canceled and the call returns an error.

**Fee note (not changed here):** this charge total is bid + 3% + 1%. `complete-service` still computes the transfer from `service.price` as 1% platform + 2.9% + $0.30. Those formulas are not unified in this contract.

**AutoFill (`use_saved_payment_method: true`):** provider `landing.tsx` calls this after inserting the fill request. Omit `amount` and `payment_method_id`. Required: `service_id`, `customer_id`, and the provider's JWT. The function checks the job is still open AutoFill (`finding_pros` or `select_service_provider`, no `service_provider_id`), reads that provider's fill-request `bid`, and charges the same total as select-helpr (bid + 3% processing + 1% platform, in cents). It loads the customer's saved card from `payment_methods` (auth user for `customer.email`, else `customer_id`) and confirms off-session. If the client also sends `amount` or `payment_method_id`, those values must match the server amount and saved card or the call is rejected (**400** / **403**) and the server values are not overridden. It returns success only when `status` is `succeeded`. Any other status is canceled and returned as an error. This path does **not** write `payment_intent_id`; the winning claim update is the writer.

**Idempotency:** A retry or double-tap must not create a second charge for the same confirm.

- Customer confirm: Stripe Idempotency-Key `helpr-confirm-{service_id}`. If `service.payment_intent_id` is reusable, or a succeeded PaymentIntent with metadata `service_id` is reusable and its `charge_path` is not `autofill`, that PaymentIntent is returned. Reusable statuses are `succeeded`, `processing`, `requires_capture`, `requires_action`, and `requires_confirmation`, and the charge is not fully refunded. A canceled or fully refunded PaymentIntent is replaced under `helpr-confirm-{service_id}-after-{prior_id}`. A card decline (`requires_payment_method`) stays on the original key for 20 seconds so a double-tap cannot start another charge, then a later retry may use the `-after-` key.
- AutoFill: key `helpr-autofill-{service_id}-{provider_id}` where `provider_id` is the signed-in provider. The same reuse and replace rules apply to that provider's charge only. A reusable PaymentIntent already stored for a different provider does not get a second charge; the call returns the not-open error. This path still does not write `payment_intent_id`.

**Response:** `{ "clientSecret", "status", "paymentIntentId" }`

Customer `select-helpr.tsx` ignores an overlapping confirm tap. It treats `status === 'succeeded'` or `processing` as already charged, or uses `clientSecret` for PaymentSheet, then writes `confirmed`, `payment_status: 'paid'`, and `payment_intent_id` together. It does not mark the row paid when the PaymentIntent id is missing. If that booking update fails after a charge, the customer taps confirm again and the function reuses the PaymentIntent. Provider AutoFill writes `confirmed`, `payment_status: 'paid'`, and `payment_intent_id` together, and only after `status === 'succeeded'` and a non-empty `paymentIntentId`. AutoFill does not mark the row confirmed or paid when the PaymentIntent id is missing.

**Error:** `{ "error": "" }` with HTTP 401 (not signed in), 403 (caller does not own the booking, or the payment method is not theirs), 400 (amount, customer, or booking does not match), or 500 (server cannot verify the charge). A 401/403/400 from this check does not create a PaymentIntent.

### `void-unclaimed-payment`

Invoked by provider `landing.tsx` when an AutoFill charge succeeded but the claim update did not win. Source: `apps/serviceprovider-app/supabase/functions/void-unclaimed-payment/index.ts`.

**Request:** `{ "paymentIntentId": "", "service_id": "" }`

Refunds a succeeded PaymentIntent, or cancels one that is not captured, only when Stripe metadata `service_id` matches and `service.payment_intent_id` is not already that id on a workable status (`confirmed`, `helpr_otw`, `in_progress`, `completed`). If the unconfirmed row still holds this id, it is cleared. A charge created in the last 20 seconds is not voided when its metadata `provider_id` is the caller and the job is still unassigned (`finding_pros`, `pending`, `scheduled`, or `select_service_provider`). That window keeps a same-provider double-tap from refunding the only charge before the claim update saves it. A lost race against a different provider is still voided.

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

**Idempotency:** A retry must not create a second Stripe transfer for the same service.

- Before `transfers.create`, load `platform_transactions` for `service_id`. If no `stripe_transfer_id` is stored, list Stripe transfers in group `service_{serviceId}`. A stored id or any existing transfer (including a reversed one) is reused. The service is marked `completed`. Provider `balance` is not credited again.
- Otherwise insert a claim row (`status: payout_pending`, no transfer id) and create the transfer with Idempotency-Key `helpr-transfer-{serviceId}`. The claim is written before the transfer. A failed claim aborts before Stripe is called.
- Save `stripe_transfer_id` with `status: transfer_recorded` immediately after Stripe returns. That write is returned as an error if it fails. A retry then finds the transfer and does not create another.
- Credit `service_provider.balance` once, and only when that row moves from `transfer_recorded` to `completed`. A finished `completed` row is never moved back to `transfer_recorded`.
- `platform_transactions.service_id` is unique (one payout ledger row per service). Overlapping calls share the Stripe idempotency key, so they still settle as one transfer when the unique index is not in place yet.

Ledger `status` values written here: `payout_pending`, `transfer_recorded`, `completed`. These are not `service.status`.

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
