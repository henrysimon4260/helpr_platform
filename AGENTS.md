# Agent ownership

Six nested lanes. Each agent writes one app per session, with exclusive file allowlists. Cross-app work goes through [`JOB_CONTRACT.md`](JOB_CONTRACT.md), then a later session on the other tree.

A session writes one app. The handoff is `JOB_CONTRACT.md` plus a new prompt, not a mid-task hop.

Website is an isolated optional lane. Do not touch either mobile app from a website session.

## Hard rules

1. **One writer per path.** The 4.3k service-form clones, customer `booked-services.tsx`, and provider `landing.tsx` cannot be shared.
2. **No mid-task app hop.** A session writes one tree. The other tree is a new session with `JOB_CONTRACT.md` attached.
3. **Primary app first.** D starts on customer. E starts on provider functions. B specifies new statuses before C implements them (or the reverse, but not both at once).
4. **No drive-by schema.** New columns, statuses, or functions go in `JOB_CONTRACT.md` before either app consumes them.
5. **Do not extract a monorepo package** while these lanes are running.
6. **Do not align Expo 54/57** as a side quest.

## Job status machine

Exact spellings. Do not invent aliases (`helpr_otw`, not `on_the_way`). Who may write each value is in [`JOB_CONTRACT.md`](JOB_CONTRACT.md).

`finding_pros` / `pending` / `scheduled` → `select_service_provider` → `confirmed` → `helpr_otw` → `in_progress` → `completed`

## The six lanes

| Agent | Primary app | Follow-up | Owns |
| --- | --- | --- | --- |
| **A Request composers** | customer only | none | `apps/customer-app/src/app/(services)/`, `apps/customer-app/src/components/services/` |
| **B Job lifecycle** | customer | C later, via contract | `apps/customer-app/src/app/(booking-flow)/`, `landing.hooks.ts`, `selectProModalTracker.ts`, `viewedCompletedServices.ts` |
| **C Marketplace** | provider only | never writes customer | `apps/serviceprovider-app/app/landing.tsx`, `ServiceDetails.tsx`, `past-services.tsx` |
| **D Identity** | customer | provider, later session | customer `(auth)/`, `account.tsx`, `AuthContext.tsx`, `components/auth/`; then provider login/signup/account/auth |
| **E Payments** | provider functions | customer payment UI | `apps/serviceprovider-app/supabase/functions/`, `api/stripe-redirect.ts`; then customer payment modals / `paymentMethods.ts` |
| **F Comms** | customer stub | provider stub | both `customer-service-chat.tsx` files. One short session may touch both stubs until messaging is real. |

App-local allowlists: [`apps/customer-app/AGENTS.md`](apps/customer-app/AGENTS.md), [`apps/serviceprovider-app/AGENTS.md`](apps/serviceprovider-app/AGENTS.md).

### A — Request composers

**Does:** Deduplicate the five ~4.3k clones using the moving module as the template. Finish per-job-type questions and pricing. Inserts stay `status: 'finding_pros'`.

**Does not:** Booking-flow screens, any provider file, new statuses after create.

### B — Customer job lifecycle

**Does:** Booked list, select-a-pro, service details, past services, customer cancellation UI, edit-after-accept, customer ratings, ETA copy. New `service.status` or `service_fill_request` rules go in `JOB_CONTRACT.md` first. Do not implement provider screens.

**Does not:** Provider `landing.tsx`, `ServiceDetails.tsx`, Stripe function bodies.

### C — Provider marketplace

**Does:** Open-job feed, bids, status buttons (`confirmed` → `helpr_otw` → `in_progress` → `completed`), landing filters, menu “in progress”, provider ratings of customers. Consume statuses from `JOB_CONTRACT.md`.

**Does not:** Customer booking-flow, signup, Connect functions, account profile CRUD.

### D — Identity and accounts

Same lane, two prompts, never one prompt for both trees. Before the provider follow-up, write the auth contract (identifier, required fields, delete behavior) in `JOB_CONTRACT.md`. Signup may call Connect helpers; it must not rewrite them (Agent E).

### E — Payments

`create-payment-intent` and `complete-service` are deployed and in git under `supabase/functions/`. Maintain those bodies and Connect / direct deposit. Publish shape changes in `JOB_CONTRACT.md` first. Agent B keeps `select-helpr.tsx`; Agent C keeps `ServiceDetails.tsx`. E does not edit those call sites in the same session as the functions.

**Does not:** Redesign booking or landing UI.

### F — Comms

Support chat, later in-app messaging, notification banners. Once messaging is real, stop the one-session exception: contract → customer → provider, two sessions.

## First wave

1. Keep `JOB_CONTRACT.md` current (solo, short).
2. In parallel, one tree each: A (dedupe forms), C (filters / in-progress menu, no new statuses), D primary (customer auth / delete-account), F stubs.
3. Later sequential pairs: B then C for cancellation/ratings; E primary, then E follow-up, then B/C call-site updates.
