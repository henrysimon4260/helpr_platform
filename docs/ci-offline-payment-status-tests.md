# Offline payment and status tests (HLP-32)

Pull requests into `dev`, and pushes to `dev`, run [`.github/workflows/offline-payment-status-tests.yml`](../.github/workflows/offline-payment-status-tests.yml). The job uses Node 22 and does not call Stripe or the hosted Supabase project. `STRIPE_SECRET_KEY`, `SUPABASE_URL`, and the service-role key are set to empty strings.

Locally:

```bash
node scripts/run-offline-payment-status-tests.mjs
```

That command:

1. Runs `node scripts/sync-helpr-core.mjs --check` when `shared/helpr-core` is on the branch (HLP-39).
2. Runs `node --experimental-strip-types --test` on every offline `*.test.mjs` and `*.test.ts` under `shared/` and `**/supabase/functions/`.
3. Also runs these payment and status files when they are present:
   - `apps/customer-app/src/app/(booking-flow)/confirmOpenJob.test.mjs`
   - `apps/customer-app/src/lib/readPaymentIntentId.test.mjs`

Suites that land with the open payment PRs are picked up by that discovery. On a revision that does not have them yet, the job still runs the runner's own checks and lists the missing paths. It does not fail only because a sibling branch has not merged.

Covered once the files are on the branch:

| Check | File |
| --- | --- |
| HLP-39 status, fee quote, zones, sync | `shared/helpr-core/helpr-core.test.mjs` |
| HLP-58 sales tax | `apps/serviceprovider-app/supabase/functions/_shared/salesTax.test.mjs` |
| HLP-37 env fail-closed | `apps/serviceprovider-app/supabase/functions/create-payment-intent/supabaseClientConfig.test.mjs` |
| HLP-38 Stripe SDK pin | `apps/serviceprovider-app/supabase/functions/complete-service/stripeSdkPin.test.mjs` |
| HLP-57 failure responses | `apps/serviceprovider-app/supabase/functions/complete-service/failureResponse.test.ts` |
| HLP-55 balance wiring | `apps/serviceprovider-app/supabase/functions/complete-service/atomicBalance.test.mjs` |
| Idempotency, transfer, cancel refund, fee quote, webhook signature | other `*.test.mjs` / `*.test.ts` under `supabase/functions/` |

## Not run in CI

`apps/serviceprovider-app/scripts/test-*.js` talks to the hosted project (and the Stripe helper scripts delete or list live accounts). Those stay manual.

## Postgres balance proof (manual)

`atomicBalance.test.mjs` asserts the migration text and the `increment_provider_balance` call. Its concurrency section skips unless `sudo -u postgres psql` works, which GitHub-hosted runners do not provide. Run the SQL proof on a machine with local Postgres:

```bash
sudo -u postgres psql -d postgres -c 'DROP DATABASE IF EXISTS helpr_balance_test'
sudo -u postgres psql -d postgres -c 'CREATE DATABASE helpr_balance_test'
sudo -u postgres psql -d helpr_balance_test -v ON_ERROR_STOP=1 -f supabase/tests/increment_provider_balance.sql
```
