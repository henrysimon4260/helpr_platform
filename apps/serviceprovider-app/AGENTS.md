# serviceprovider-app

This tree is Expo 54. Do not hop to `apps/customer-app` in the same session. Cross-app work: write [`JOB_CONTRACT.md`](../../JOB_CONTRACT.md), then start a new customer session. Shared rules: [`AGENTS.md`](../../AGENTS.md).

Do not align this SDK with customer Expo 57.

Import shared status, checkout-fee, and zone helpers from `src/lib/helpr-core/` (edge functions: `supabase/functions/_shared/helpr-core/`). Those files are byte copies of `shared/helpr-core/`. Edit the canonical file and run `node scripts/sync-helpr-core.mjs`. Do not hand-edit the copy. Details: [`docs/shared-status-fee-zone.md`](../../docs/shared-status-fee-zone.md).

## Who writes here

| Agent | Role in this tree | Allowlist |
| --- | --- | --- |
| **C Marketplace** | Primary. Never writes customer files. | `app/landing.tsx`, `app/ServiceDetails.tsx`, `app/past-services.tsx` |
| **D Identity** | Follow-up only, after the customer auth session and an auth contract. | `app/login.tsx`, `app/signup.tsx`, `app/account.tsx`, `src/contexts/AuthContext.tsx`, `src/lib/providerProfile.ts`, deep-link/OAuth bits of `app/_layout.tsx` |
| **E Payments** | Primary. Customer payment UI is a later session. | `supabase/functions/`, `api/stripe-redirect.ts` |
| **F Comms** | Stub. May share one short session with the customer stub until messaging is real. | `app/customer-service-chat.tsx` |

Agents A and B never write this tree. Signup may call Connect helpers; it must not rewrite them (E). E does not edit `app/ServiceDetails.tsx` in the same session as the functions — C owns that call site.

## Statuses

C consumes `service.status` values from [`JOB_CONTRACT.md`](../../JOB_CONTRACT.md). Do not invent new spellings here if B already specified them. Provider buttons: `confirmed` → `helpr_otw` → `in_progress` → `completed`.
