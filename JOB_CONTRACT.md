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

## Helpr Happiness (discretionary goodwill)

HLP-67. This is **not insurance**. Do not write customer copy that says the customer is insured, that Helpr sells a policy, or that a loss is covered up to a limit. The program name is **Helpr Happiness**. It is discretionary goodwill, secondary to the customer's own homeowner's or renter's insurance.

It is separate from payment refunds and card disputes (HLP-64). A Happiness decision must not change `service.status` or `service.payment_status`.

### Cap and window

| Constant | Value |
| --- | --- |
| Cap | `100000` cents (`$1,000`). No other product constant sets a different cap. |
| Claim window | 30 days, measured from `coalesce(service.completed_at, service.date_of_creation)`. |

`service.completed_at` (`timestamptz`, nullable) is written by `complete-service` when it sets `status` to `completed`. If that write cannot land, completion still sets `status` alone. Until `completed_at` is present, the window falls back to `date_of_creation`.

### Who may file

The customer who owns the job (`customer_id` = `auth.uid()`), and only when all of these are true:

- `service.status` is `completed`
- `service.payment_status` is `paid`
- The request is inside the 30-day window
- One claim row per `service_id`
- Incident type is `property_damage`, `theft`, or `limited_injury`, and the customer attests it came from the provider's negligence during that booked job
- The customer acknowledges: not insurance, secondary to their own policy, and the exclusion list
- Narrative plus evidence (photo paths and/or a written evidence account)

### Exclusions

Ops denies when any of these apply. The same list is shown before the customer pays and on the trust pages.

- Vehicles, boats, aircraft, and anything inside them
- Cash, gift cards, cryptocurrency, and securities
- Water, flood, sewage, mold, or weather
- The ordinary result of the booked job
- Damage from following the customer's instructions
- Pre-existing damage or loss
- Items the customer asked the Helpr to change, repair, move, or discard, when the result matches that request
- Indirect loss (lost wages, missed work, lodging)
- Loss outside the booked job
- A request opened after the claim window

### `helpr_happiness_claim`

Customers insert and read their own rows. They do not update or delete. Operations updates go through the edge function below (service role), which bypasses RLS. A trigger still rejects updates that are not from `service_role` / the database owner.

| Field | Meaning |
| --- | --- |
| `id` | Claim id. The client may supply a uuid so evidence paths can be reserved first. |
| `service_id` | Completed paid job. Unique. |
| `customer_id` | Auth user id of the customer. Must match the job. |
| `service_provider_id` | Copied from the job on insert. The client value is ignored. |
| `incident_type` | `property_damage` / `theft` / `limited_injury`. |
| `narrative` | What happened. |
| `amount_requested_cents` | 1 through `100000`. |
| `evidence_notes` | What the files show, or a written account of the proof. |
| `evidence_paths` | Object paths in the private bucket `happiness-claim-evidence`, each under `{customer_id}/{claim_id}/`. |
| `acknowledged_not_insurance` | Must be true. |
| `acknowledged_secondary` | Must be true. Secondary to the customer's own insurance. |
| `acknowledged_exclusions` | Must be true. |
| `negligence_attestation` | Must be true. |
| `own_coverage_pursued` | Whether the customer asked their own insurer. |
| `own_coverage_notes` | Required when `own_coverage_pursued` is false. |
| `status` | `submitted` / `needs_info` / `denied` / `paid`. Insert forces `submitted`. |
| `outcome` | Null until ops resolves: `approved` / `partial` / `denied` / `needs_info`. |
| `amount_approved_cents` | Null until a pay decision. Never above the cap or the request. `approve` pays the requested amount. `partial` pays less. A request above the cap cannot be filed. |
| `payout_method` | `stripe_refund` or `manual`. Null until paid. |
| `stripe_refund_id` | Set only for a card refund. |
| `decision_notes` | Ops reason, in language that does not call the program insurance. |
| `resolved_at` / `resolved_by` | Set when ops resolves. |

`stripe_refund` can refund only up to the amount still refundable on that job's PaymentIntent. It does not send goodwill above the card charge. Use `manual` to record an award that is not a card refund. Manual does not move Stripe money; the row is the book of record after finance sends it (say so in `decision_notes` if it is still outstanding).

### `resolve-happiness-claim`

Ops only. Source: `apps/serviceprovider-app/supabase/functions/resolve-happiness-claim/`. Not called by the customer app.

**Auth:** header `x-helpr-ops-key` matching the server secret `HELPR_OPS_KEY`, or a user JWT whose `app_metadata.role` is `ops`. Do not trust `user_metadata`.

**Request:**

```json
{
  "claimId": "",
  "decision": "approve",
  "amountApprovedCents": 0,
  "payoutMethod": "manual",
  "notes": ""
}
```

`decision` is `approve`, `partial`, `deny`, or `needs_info`. `amountApprovedCents` is required for `partial`. `payoutMethod` is required for `approve` and `partial` (`stripe_refund` or `manual`). `notes` is required.

**Success:** `{ "success": true, "status", "outcome", "amountApprovedCents", "stripeRefundId", "payoutMethod" }`

**Error:** `{ "success": false, "error": "" }` with an HTTP 4xx/5xx status. This function does not reuse the `complete-service` habit of returning HTTP 200 for failures.

Playbook: [`docs/helpr-happiness-ops.md`](docs/helpr-happiness-ops.md).

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

Invoked by provider `ServiceDetails.tsx` (C) when advancing `in_progress` → `completed`. Source: `apps/serviceprovider-app/supabase/functions/complete-service/index.ts`. Writer of `service.status = 'completed'` and `service.completed_at` (see Helpr Happiness). If `completed_at` is not in the database yet, the function still writes `status`.

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
