# Shared status, fee, and zone logic (HLP-39)

Customer app is Expo SDK 57 (React Native 0.86, TypeScript 6). Provider app is Expo SDK 54 (React Native 0.81, TypeScript 5.9). `d4a2cde` removed the pnpm workspace so the two installs would not fight. [AGENTS.md](../AGENTS.md) forbids a `packages/` workspace module and forbids aligning the SDKs. Status spellings, the checkout fee quote, and the NYC-area bounding boxes were copied by hand and had started to drift.

This document is the sharing plan. The first cut is in the same change.

## Recommendation

Canonical plain TypeScript lives in [`shared/helpr-core/`](../shared/helpr-core). It is not an npm package: no `package.json`, no dependency on Expo, React, React Native, or Deno, and no imports between the files.

`node scripts/sync-helpr-core.mjs` copies those files byte-for-byte into:

| Consumer | Path | Why this path |
| --- | --- | --- |
| Customer Metro (Expo 57) | `apps/customer-app/src/lib/helpr-core/` | Inside the app, so Metro resolves it with the app's own TypeScript. |
| Provider Metro (Expo 54) | `apps/serviceprovider-app/src/lib/helpr-core/` | Same, for the other SDK. |
| Edge functions (Deno) | `apps/serviceprovider-app/supabase/functions/_shared/helpr-core/` | Supabase bundles `_shared` next to the function. Deno imports the `.ts` file by relative path. |

`node scripts/sync-helpr-core.mjs --check` exits non-zero if any copy differs or if a destination has an extra `.ts` file. Edit `shared/helpr-core/`, run the sync, and commit the canonical files and the copies together. Do not fix drift by editing a copy.

Lane sessions still write one app's screens. A change to this logic is edited once in `shared/helpr-core/` and the sync refreshes every copy. Do not add `packages/`.

## Options considered

### 1. `packages/helpr-core` workspace package

Rejected. AGENTS.md rule 5 forbids a monorepo package while the lanes are running. The root `tsconfig.json` used to point `@helpr/*` at `packages/*/src`; that mapping is removed so it is not a template. A real package would also need one module graph across two React Native versions, and Deno would still need a second entry. The workspace files were removed on purpose.

### 2. Apps import the edge `_shared` Deno modules directly

Rejected as the sharing mechanism. Those files sit inside the provider Supabase tree. Customer Metro would need `watchFolders` outside the Expo project, and Expo 54 and 57 do not share a Metro config. Importing a server file that also contains settlement or Stripe calls would pull that into the client. Edge `_shared` stays the deploy root for functions. It receives a synced copy. It is not the source the apps import.

HLP-23 (PR #24, open against `dev`) already uses the pairwise version of this idea: `bookingFees.ts` in `_shared` and a hand copy in the customer payment summary, with a test that imports both. That locks one pair. It does not cover the provider app, and the canonical file is only named in a comment. Three runtimes need one source directory and a checker, not another hand copy.

### 3. One app owns the source, the other is a checked copy

Rejected. Making `apps/customer-app` the source would put provider and edge edits on a customer-lane path. A neutral `shared/helpr-core/` directory is not a workspace package.

### 4. `JOB_CONTRACT.md` only

Kept, and not enough by itself. The contract is where a new status, column, or function payload is specified. It does not stop the service-details frame maps or the feed sets from diverging in code (HLP-53). The module encodes the contract that is already written. It does not invent spellings.

## What is shared

The modules use syntax that TypeScript 5.9 and TypeScript 6 both accept. They have no relative imports, so Metro (no extension) and Deno (`.ts` extension) never disagree about the specifier.

### `status.ts`

Spellings from [JOB_CONTRACT.md](../JOB_CONTRACT.md):

`finding_pros` / `pending` / `scheduled` → `select_service_provider` → `confirmed` → `helpr_otw` → `in_progress` → `completed`

Also:

- Open-feed and in-progress feed sets used by provider `landing.tsx`.
- `nextProviderCheckpointStatus`: `confirmed` → `helpr_otw` → `in_progress` → `completed`. Returning `completed` means "call `complete-service`". The edge function writes that status.
- `STATUS_ANIMATION_FRAMES`: `confirmed` 0, `helpr_otw` 20, `in_progress` 50, `completed` 70. Unknown statuses stay on frame 0.

`cancelled` is not included. PR #15 specifies it in the contract; add it to `status.ts` only after that text is on `dev`. Aliases such as `on_the_way` are rejected.

### `fees.ts`

`quoteBookingFees` is the checkout quote already used by `select-helpr.tsx` and `PaymentSummaryModal`:

- processing = 3% of the service price, rounded to the nearest cent
- platform = 1% of the service price, rounded to the nearest cent
- charge = price + both fees, rounded to the nearest cent

`$100` quotes as 300 + 100 processing/platform cents and `10400` charge cents. `0`, negatives, and `NaN` return null.

Clients display this quote. They do not invent a second rate. This file does not settle a provider transfer and does not import sales tax. Settlement stays in HLP-23 `bookingFees.ts` (`settleBookingFees`). Taxability stays in HLP-58 `_shared/salesTax.ts`. Those fees are not the taxable base, and this module does not recalculate them.

### `zones.ts`

The eight inclusive bounding boxes that were copied in `moving.utils.ts` and the five composers: Manhattan, Brooklyn, Queens, Bronx, Staten Island, Westchester County, Hudson County, Bergen County. Coordinates are unchanged. HLP-40 is the ticket that may retune them.

## First cut wiring

| Call site | What it imports |
| --- | --- |
| Customer `service-details.tsx` | `animationFrameForStatus` |
| Provider `ServiceDetails.tsx` | `animationFrameForStatus`, `nextProviderCheckpointStatus` |
| Provider `landing.tsx` | `OPEN_FEED_STATUSES`, `IN_PROGRESS_FEED_STATUSES` |
| Customer `moving/moving.utils.ts` | re-exports the zone helpers |

The moving module is the composer template. The five ~4.3k clones still contain their own box lists. A unit test fails if those lists diverge from `zones.ts`.

## Follow-ups

- **HLP-53** (unify the progress machines): replace the remaining inline status lists. Provider `landing.tsx` still builds a mixed-case `statusesToQuery` (`Finding_Pros`, `Helpr_Otw`, …) and a long `||` filter. Customer `booked-services.tsx` still branches on raw strings. Do not canonize the mixed-case aliases. When PR #15 lands `cancelled`, add that spelling to the contract first, then to `status.ts`, then sync.
- **HLP-40** (zone boxes copied 6x): point `cleaning.tsx`, `furniture-assembly.tsx`, `home-improvement.tsx`, `wall-mounting.tsx`, and `custom-service.tsx` at `helpr-core/zones`, then delete their local arrays. Retuning boxes for water or over-included counties is part of that ticket, not this one.
- **HLP-39 remainder** (fees): after PR #24 merges, change `_shared/bookingFees.ts` `quoteBookingFees` and `PaymentSummaryModal/fees.ts` so they re-export `helpr-core/fees.ts`. Keep `settleBookingFees` in the edge module. Do not change the 3% and 1% rates. Do not rewrite `salesTax.ts` (HLP-58, PR #29) or `quote-service-price` (HLP-47, PR #28). `select-helpr.tsx` can then call `quoteBookingFees` instead of inlining the same formula. Until that lands, the HLP-39 test still requires those screens to use 3% and 1% or to call this helper.

## Verify

```bash
node --experimental-strip-types --test shared/helpr-core/helpr-core.test.mjs
node scripts/sync-helpr-core.mjs --check
```

Node 22 strips the TypeScript types. No Expo install is required for that check.
