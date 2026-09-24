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

### `quote-service-price`

Moving (HLP-59), cleaning (HLP-60), furniture assembly (HLP-61), and wall mounting (HLP-62). Source: `apps/serviceprovider-app/supabase/functions/quote-service-price/`. Called by the customer composer before scheduling, and by the provider feed before a bid or request. The response is the estimate. Clients must not send a price, a duration, or (for moving) a distance, and must not display a range they computed themselves.

Moving distance is computed on the server with Google Distance Matrix (`GOOGLE_MAPS_API_KEY`, or `GOOGLE_PLACES_API_KEY` if that is the secret already stored). Cleaning, furniture assembly, and wall mounting do not use maps. The price range and job duration come from `OPENAI_API_KEY` (`gpt-4o-mini`). Secrets are server-side. Unit tests mock maps and the model, so CI does not need the keys. See the function README.

This function does not change capture, tax, Connect MCC, or the platform fee (3% processing + 1% platform, as deployed on `complete-service`). Cleaning, furniture assembly, and wall mounting do not add columns. Home size travels on the cleaning quote request and in the job description (`Property size:`). Assembly items travel on the furniture quote request and in the job description (`Assembly items:`). The mounted item travels on the wall-mounting quote request and in the job description (`Mount item:`). Writes use canonical `service_type` `wall-mounting`.

**Request:**

```json
{
  "serviceType": "moving",
  "origin": { "address": "", "latitude": 0, "longitude": 0 },
  "destination": { "address": "", "latitude": 0, "longitude": 0 },
  "description": "",
  "stairs": true,
  "elevator": false,
  "floor": 3,
  "volumeHint": "2 bedroom",
  "weightHint": "heavy sofa",
  "crewSize": 2,
  "needsTruck": true
}
```

`origin` and `destination` each need an address or coordinates. Optional metadata may be omitted. `distanceMiles`, `price`, `priceMin`, `priceMax`, and `durationMinutes` on the request are ignored.

**Success:**

```json
{
  "serviceType": "moving",
  "distanceMiles": 0,
  "drivingDurationMinutes": 0,
  "priceMin": 0,
  "priceMax": 0,
  "suggestedPrice": 0,
  "durationMinutes": 0,
  "currency": "usd",
  "source": "server"
}
```

`source` is always `"server"`. `suggestedPrice` is the midpoint the customer job may store on `service.price`. The provider shows `priceMin`–`priceMax` and `durationMinutes` before bidding.

**Cleaning request** (`serviceType: "cleaning"`). Home size is required: `squareFeet` and/or `bedrooms` (0 is a studio) and/or `bathrooms`. The server also reads size from `description` when those fields are omitted (`Property size:`, `studio`, `2 bedroom`, `1800 sq ft`). Optional: `condition` (`light` | `average` | `heavy`), `petHair` (boolean), `depth` (`standard` | `deep`; `basic` is accepted as standard), `frequency` (`one_time` | `weekly` | `biweekly` | `monthly`). `price`, `priceMin`, `priceMax`, `suggestedPrice`, and `durationMinutes` on the request are ignored.

```json
{
  "serviceType": "cleaning",
  "squareFeet": 450,
  "bedrooms": 0,
  "bathrooms": 1,
  "condition": "average",
  "petHair": false,
  "depth": "standard",
  "frequency": "one_time",
  "description": ""
}
```

**Cleaning success:**

```json
{
  "serviceType": "cleaning",
  "squareFeet": 450,
  "bedrooms": 0,
  "bathrooms": 1,
  "sizeLabel": "studio, 1 bathroom, 450 sq ft",
  "priceMin": 0,
  "priceMax": 0,
  "suggestedPrice": 0,
  "durationMinutes": 0,
  "currency": "usd",
  "source": "server"
}
```

A larger home must come back with a higher range and a longer duration than a studio. The provider feed shows that range before Request or Adjust Bid.

**Furniture assembly request** (`serviceType: "furniture-assembly"`; `furniture assembly` and `assembly` are accepted). At least one item is required. Each item needs a product name, SKU, or type, a `pieceCount` (1–200), and `complexity` (`simple` | `moderate` | `complex`). The server also reads items from `description` when `items` is omitted (`Assembly items: dining chair | type: chair | pieces: 1 | complexity: simple`, or a sentence such as `one dining chair` / `wardrobe, 8 pieces, complex`). Optional: per-item or top-level `brand` and `model`, `toolsNeeded`, `photoCount`, and `photos` (captions or https URLs; local file URIs are counted only). `price`, `priceMin`, `priceMax`, `suggestedPrice`, and `durationMinutes` on the request are ignored.

```json
{
  "serviceType": "furniture-assembly",
  "items": [
    {
      "name": "dining chair",
      "sku": "ADDE",
      "type": "chair",
      "pieceCount": 1,
      "complexity": "simple",
      "brand": "IKEA",
      "model": "ADDE"
    }
  ],
  "toolsNeeded": "Allen key",
  "photoCount": 1,
  "description": ""
}
```

**Furniture assembly success:**

```json
{
  "serviceType": "furniture-assembly",
  "items": [
    {
      "name": "dining chair",
      "type": "chair",
      "pieceCount": 1,
      "complexity": "simple",
      "brand": "IKEA",
      "model": "ADDE",
      "sku": "ADDE"
    }
  ],
  "itemLabel": "dining chair (1 piece, simple)",
  "pieceCount": 1,
  "complexity": "simple",
  "toolsNeeded": "Allen key",
  "photoCount": 1,
  "priceMin": 0,
  "priceMax": 0,
  "suggestedPrice": 0,
  "durationMinutes": 0,
  "currency": "usd",
  "source": "server",
  "taxableLineItem": {
    "service_type": "furniture-assembly",
    "amount": 0,
    "amount_cents": 0,
    "description": "dining chair (1 piece, simple)"
  }
}
```

`taxableLineItem` is metadata for a later NY sales-tax line (`service_type` plus `amount` or `amount_cents`). Furniture assembly is taxable in NY. This estimate does not calculate tax, change the fee, or choose a rate. A multi-piece or complex fixture (wardrobe) must come back with a higher range and a longer duration than a single simple piece (chair). The provider feed shows that range before Request or Adjust Bid.

**Wall mounting request** (`serviceType: "wall-mounting"`; `wall mounting`, `wall_mounting`, and `wall mount` are accepted). The mounted item is required: a name such as `picture frame` or `65 inch TV`, or a sentence in `description` (`Hang a picture frame.` / `Mount a 65 inch TV.`). The server also reads `Mount item: picture frame | type: picture | size: 16 in`. Optional: `itemType` (`picture` | `art` | `shelf` | `mirror` | `tv`), `sizeInches`, `wallType` (`drywall` | `plaster` | `brick` | `concrete` | `tile` | `wood`), `heightFeet`, `studFinding`, and `hardwareIncluded`. The same optionals are read from `Wall type:`, `Mount height:`, `Stud finding:`, and `Hardware included:` in `description`. `price`, `priceMin`, `priceMax`, `suggestedPrice`, `durationMinutes`, and `weightClass` on the request are ignored. Weight class is derived from the item (a picture is light; a 65 inch TV is heavy).

```json
{
  "serviceType": "wall-mounting",
  "item": "65 inch TV",
  "itemType": "tv",
  "sizeInches": 65,
  "wallType": "drywall",
  "heightFeet": 5,
  "studFinding": true,
  "hardwareIncluded": false,
  "description": ""
}
```

**Wall mounting success:**

```json
{
  "serviceType": "wall-mounting",
  "item": {
    "name": "65 inch TV",
    "type": "tv",
    "sizeInches": 65,
    "weightClass": "heavy"
  },
  "itemLabel": "65 inch TV (heavy, 65 in)",
  "wallType": "drywall",
  "heightFeet": 5,
  "studFinding": true,
  "hardwareIncluded": false,
  "priceMin": 0,
  "priceMax": 0,
  "suggestedPrice": 0,
  "durationMinutes": 0,
  "currency": "usd",
  "source": "server",
  "taxableLineItem": {
    "service_type": "wall-mounting",
    "amount": 0,
    "amount_cents": 0,
    "description": "65 inch TV (heavy, 65 in)"
  }
}
```

`taxableLineItem` uses the same shape as furniture assembly (`service_type` plus `amount` or `amount_cents`). Wall mounting is a taxable home-improvement style service in NY. This estimate does not calculate tax, change the fee, or choose a rate. A 65 inch TV must come back with a higher range and a longer duration than a picture. The provider feed shows that range before Request or Adjust Bid. Other service types return `{ "error": "" }`.

**Error:** `{ "error": "" }`

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
