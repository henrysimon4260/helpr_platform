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

### `service.price`

Pre-accept, `service.price` is a server quote, not a number the client calculated.

| Who | When |
| --- | --- |
| Customer app (A) | Insert or update `price` only when it equals an unexpired `service_price_quote` for the same `service_type`, `description`, `start_location`, `end_location`, and `location`. Composers display that quote. They do not call OpenAI for the amount. |
| Customer app (B) on select-a-pro, provider app (C) on AutoFill | May set `price` to that provider's `service_fill_request.bid` in the same update that assigns `service_provider_id` and sets `status` to `confirmed` from an open, unassigned job. |
| Edge function `quote-service-price` | Inserts the quote row with the service role. It does not update `service.price` itself. |
| Service role | Any price write. |

A client write that does not match a live quote or that accepted bid is rejected (`service.price is server-managed`). After a provider is assigned, or once `payment_status` is `paid`, clients cannot change `price`. Changing the description or locations on an open job requires a quote for the new text.

Checkout still charges the accepted bid plus 3% processing and 1% platform. HLP-24 binds the PaymentIntent to that total. This rule is what stops a local LLM result or a direct write of `price` from becoming that base. It does not add an authorize-then-capture step.

### `quote-service-price`

JWT required (`verify_jwt = true`). Source: `apps/serviceprovider-app/supabase/functions/quote-service-price/index.ts`. The anon key may request a preview before sign-in. An authenticated caller is checked with `auth.getUser`. The model key is the function secret `OPENAI_API_KEY`. `EXPO_PUBLIC_OPENAI_API_KEY` is not the authority for a billed amount. Do not put that secret in the app.

**Request:**

```json
{
  "service_type": "Moving",
  "description": "",
  "start_location": "",
  "end_location": "",
  "location": "",
  "needs_truck": false
}
```

`service_type` is the same string the composer stores (`Moving`, `cleaning`, `home-improvement`, `furniture-assembly`, `customService`). `price`, `amount`, and fee fields on the request are ignored. Client coordinates are ignored. A moving description that says a truck is needed is priced as a truck job.

**Price response:**

```json
{
  "quote_id": "",
  "price": 0,
  "note": null,
  "processing_fee": 0,
  "platform_fee": 0,
  "customer_total": 0,
  "customer_total_cents": 0
}
```

`price` is the service dollars. `processing_fee` is 3% of that price and `platform_fee` is 1%, each rounded to the nearest cent. `customer_total` is the sum, rounded to the nearest cent. That matches checkout. It is not a PaymentIntent and it does not authorize or capture a card.

The same job text returns the stored quote for 24 hours, so the amount on screen and the amount written on the row stay the same.

**Clarification:** `{ "needs_clarification": true, "clarification_prompt": "" }`

**Safety:** `{ "safety_concern": true, "safety_message": "" }`

**Error:** `{ "error": "" }`

Optional function secret `GOOGLE_MAPS_API_KEY` (or `GOOGLE_PLACES_API_KEY`) geocodes moving addresses and applies the existing short-trip formula from that server route.

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
