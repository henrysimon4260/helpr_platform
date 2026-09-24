# helpr
a tasking app that determines a flat rate and provides a service provider to customer matching service

# install and run
run pnpm install from customer-app and service-provider directories
run npx expo run:ios (may need to rerun if there are port conflicts)

# Open Issues

- add functionality for all job types after moving is complete
- ratings flow
- add ratings to request card
- cancellation flow at all stages including warnings
- flow for editing request after job has already been accepted (send request to helpr for changes)
- estimated start and finish time flow (add to service details)
- change default popups to stylized and make new popups where needed (check each step in job flow to see if popup is needed)
- menuButton redo for serviceprovider-app replace booked services with 'in progress'
- change border for containers to match dropdown border 
- are you sure you want to cancel button and are you sure you want to cancel request button
- switch cancel button and select a pro / add cancel to edit request text after job has been confirmed
- finish past services page
- filters for landing page in serviceprovider app 
- delete account functionality for both apps
- safe area / tap to close on all keyboard inputs
- fix glitchy text (try on device first to see if this is a simulator-only issue)
- change verification to phone instead of email and add autofill
- continue w google/apple buttons on login (add phone num for that)
- make everything compatible across different devices
- no styles inline
- sep style file?
- banner/home screen/ etc notification flow 
- make sure supabase can handle requests
- reviews flow for app store
- messaging between customer and service provider flow
- build customer support chatbot with openAI integration
- payment method / direct deposit flow
- determine pricing strategy for services vs competitors
- background check: Checkr go-live gate is specified below. Do not mark a provider clear by hand.

production checklist

- RLS on sql table
- website with qr codes
- dedicated email for help and verification emails
- financial model w 6 month projections
- remove logs?
- API keys restricted

# Checkr background checks (HLP-50)

Pros cannot see the open-job feed or accept paid work until Checkr reports **clear**. `consider` fails closed: it blocks go-live, and `report.engaged` does not override that. Stripe Connect remains payout KYC only.

This environment does not have Checkr keys. The app and edge functions will not invent a clear result. Until the secrets and migration below are applied, providers stay `not_started` and the feed stays locked.

Flynn owns the knowledge base. Mirror this section there: statuses, the consider fail-closed rule, and that only the webhook may write `clear`.

## Secrets

Set these on the Supabase project (Edge Function secrets), not in the mobile app:

| Name | Purpose |
| --- | --- |
| `CHECKR_API_KEY` | Checkr secret API key. HTTP Basic username; password empty. Also the default webhook HMAC key for standard accounts. |
| `CHECKR_PACKAGE` | Package slug from the Checkr dashboard. No default. Example slug from Checkr's own docs is `tasker_standard`; use the slug created for Helpr. |
| `CHECKR_WEBHOOK_SECRET` | HMAC key for `X-Checkr-Signature`. Standard accounts: the API key. Partner applications: the partner `client_secret`. If unset, the webhook falls back to `CHECKR_API_KEY`. |
| `CHECKR_API_BASE_URL` | `https://api.checkr-staging.com/v1` for staging keys. `https://api.checkr.com/v1` for production. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions by Supabase.

A template lives at `apps/serviceprovider-app/supabase/functions/.env.example`.

## Dashboard steps

1. Create the Checkr staging account and a package. Copy the package slug.
2. Create a staging API key. Staging keys only work against `https://api.checkr-staging.com/v1`. Test invitations do not email the candidate; open `invitation_url` from the function response.
3. Apply `apps/serviceprovider-app/supabase/migrations/20260924160000_checkr_provider_gate.sql` to the database (`supabase db push` or the SQL editor). This adds Checkr columns and blocks bids and new assignments unless `checkr_status = 'clear'`. Existing providers become `not_started`. Do not backfill `clear`.
4. Deploy functions from `apps/serviceprovider-app`:
   - `supabase functions deploy create-checkr-invitation`
   - `supabase functions deploy checkr-webhook --no-verify-jwt`
5. Set the secrets:
   `supabase secrets set CHECKR_API_KEY=... CHECKR_PACKAGE=... CHECKR_WEBHOOK_SECRET=... CHECKR_API_BASE_URL=https://api.checkr-staging.com/v1`
6. In the Checkr dashboard, add an HTTPS webhook:
   `https://<project-ref>.supabase.co/functions/v1/checkr-webhook`
   Subscribe to `invitation.created`, `invitation.completed`, `invitation.expired`, `invitation.deleted`, `report.created`, `report.updated`, `report.completed`, `report.suspended`, `report.resumed`, `report.canceled`, `report.disputed`, and `report.engaged`.
7. Confirm a test provider: start the check in the provider app (work state required), finish the hosted invitation, and wait for `report.completed` with `result = clear`. Only then does the open-job feed unlock.

## Ops

Failed, expired, and stuck checks:

```sql
SELECT service_provider_id, email, checkr_status, checkr_report_id, checkr_last_event, checkr_status_updated_at
FROM service_provider
WHERE checkr_status IN ('consider', 'suspended', 'expired', 'canceled')
   OR (checkr_status = 'pending' AND checkr_status_updated_at < now() - interval '8 days');
```

`consider` and `suspended` cannot start a new invitation from the app. Support has to resolve those in Checkr. Do not set `checkr_status` to `clear` in SQL.






