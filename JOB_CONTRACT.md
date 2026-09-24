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

`amount` is integer cents. It is the existing pre-tax checkout total: accepted price + 3% processing + 1% platform. The client does not send tax. `service_id` is required. `customer_email` is optional if `customer_id` can be resolved.

Sales tax is computed on the server from the stored service type, description, and address, and from the stored `service.price` or fill-request `bid` that matches `amount`. The 3% and 1% fees are not recalculated and are not part of the taxable base. The PaymentIntent is created for `amount` + sales tax.

Taxability (HLP-58, KB matrix): cleaning, furniture assembly (including disassemble/reassemble), wall mounting, and home improvement are taxable. Pure moving is not. Mixed line items are unbundled. Assembly, cleaning, wall mounting, or packing-as-service bundled under a moving SKU with no separate amount is taxed (fail closed) instead of a silent zero. NJ destination tax is out of scope. Rates live in `supabase/functions/_shared/salesTax.ts` (NYC 8.875%, Yonkers 8.875%, Westchester 8.375%).

**Response:** `{ "clientSecret", "status", "paymentIntentId", "amount", "pre_tax_amount_cents", "sales_tax" }`

`amount` is the charged cents (pre-tax total + tax). `sales_tax.line_items` splits taxable and non-taxable portions. `sales_tax` includes `tax_cents`, `taxable_base_cents`, `job_type_codes`, `jurisdiction`, and `fail_closed`.

PaymentIntent metadata: `sales_tax_cents`, `taxable_base_cents`, `nontaxable_base_cents`, `job_type_codes`, `sales_tax_jurisdiction`, `sales_tax_rate_parts`, `sales_tax_fail_closed`, `sales_tax_lines`, `pre_tax_amount_cents`, `charge_amount_cents`.

B treats `status === 'succeeded'` as already confirmed, or uses `clientSecret` for PaymentSheet, then writes `confirmed` and `payment_status: 'paid'`. B should display `sales_tax` from this response; the client must not recompute tax.

**Error:** `{ "error": "", "code": "" }`

### `quote-sales-tax`

Quote-time tax for the same module. Does not create a PaymentIntent. Source: `apps/serviceprovider-app/supabase/functions/quote-sales-tax/index.ts`.

**Request:** `service_type` plus `amount_cents` (or `amount` in dollars), or `line_items[]` of `{ service_type, amount_cents | amount, description }`. Address is `address`, `location`, or `start_location`. Optional `description` is scanned when a moving line has no separate taxable amount.

Client `tax_cents` is ignored.

**Response:** the `sales_tax` object (`line_items`, `tax_cents`, `taxable_base_cents`, `nontaxable_base_cents`, `job_type_codes`, `jurisdiction`, `rate`, `fail_closed`, `resolution`).

**Error:** `{ "error": "", "code": "" }`

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

Sales tax from `create-payment-intent` is part of the Stripe charge only. It is not added to `service.price` and is not part of the provider transfer.

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
