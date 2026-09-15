# customer-app

This tree is Expo 57. Do not hop to `apps/serviceprovider-app` in the same session. Cross-app work: write [`JOB_CONTRACT.md`](../../JOB_CONTRACT.md), then start a new provider session. Shared rules: [`AGENTS.md`](../../AGENTS.md).

Do not align this SDK with provider Expo 54.

## Who writes here

| Agent | Role in this tree | Allowlist |
| --- | --- | --- |
| **A Request composers** | Primary. Customer only. | `src/app/(services)/`, `src/components/services/` |
| **B Job lifecycle** | Primary. Provider half is C later. | `src/app/(booking-flow)/`, `src/app/(home)/landing/landing.hooks.ts`, `src/lib/selectProModalTracker.ts`, `src/lib/viewedCompletedServices.ts` |
| **D Identity** | Primary. Provider follow-up is a later session. | `src/app/(auth)/`, `src/app/(home)/account.tsx`, `src/context/AuthContext.tsx`, `src/components/auth/` |
| **E Payments** | Follow-up only, after provider functions and a published contract. | `src/components/common/PaymentMethodModal/`, `src/components/services/PaymentSummaryModal/`, `src/lib/paymentMethods.ts`, StripeProvider in `src/app/_layout.tsx` |
| **F Comms** | Stub. May share one short session with the provider stub until messaging is real. | `src/app/(home)/customer-service-chat.tsx` |

Agent C never writes this tree. Agent E does not edit `src/app/(booking-flow)/select-helpr.tsx` in the same session as the edge functions — B owns that call site.

## New job insert

Composers (A) create rows with `status: 'finding_pros'` only. No statuses after create. Spellings and writers: [`JOB_CONTRACT.md`](../../JOB_CONTRACT.md).
