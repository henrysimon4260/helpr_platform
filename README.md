# helpr
a tasking app that determines a flat rate and provides a service provider to customer matching service

# install and run
run pnpm install from customer-app and service-provider directories
run npx expo run:ios (may need to rerun if there are port conflicts)

# In-job chat and push (HLP-31)

Confirmed jobs have a customer ↔ assigned-provider thread in both apps. Unassigned and pre-confirm jobs do not. Cancel, on the way, arrived/start (`in_progress`), and complete write an in-app alert first, then try Expo push. Push is not reported as delivered unless Expo accepts the ticket.

There is no SMS fallback and no support bot in this thread.

## 1. Database

Apply `apps/serviceprovider-app/supabase/migrations/20260924170000_job_chat_notify.sql` in the Supabase SQL editor, or from `apps/serviceprovider-app` after linking the project:

```bash
supabase db push
```

That creates `job_messages`, `job_notifications`, and `device_push_tokens`, with RLS. `service_id` is `uuid`. If `public.service.service_id` is a different type, change the migration before applying it.

## 2. Edge function

```bash
supabase functions deploy notify-job --project-ref hecikcopbdhhiilhgmrd
```

The function reads the service role key that Supabase injects. It does not send push until the secret below is set.

## 3. Expo access token (required for push)

1. Expo dashboard → Account settings → Access tokens → create a token.
2. Supabase dashboard → Edge Functions → Secrets (or CLI):

```bash
supabase secrets set EXPO_ACCESS_TOKEN=your-expo-token --project-ref hecikcopbdhhiilhgmrd
```

If `EXPO_ACCESS_TOKEN` is missing, `notify-job` sets `push_status` to `degraded` and `push_error` to `expo_access_token_missing`. The alert row still exists. The apps show an in-app badge and do not say the push was delivered.

## 4. FCM and APNs (required for device delivery)

Each app has its own EAS project id in `app.json` (`extra.eas.projectId`).

Customer: `8e5947f9-d149-4eea-9f9b-cfc0e25b605e`  
Provider: `38fbc1bb-d6eb-4fe9-8047-812872414957`

For each project, in the Expo dashboard → Project → Credentials:

- **Android / FCM:** add the Firebase Cloud Messaging V1 service account JSON. Do not commit that JSON or `google-services.json`.
- **iOS / APNs:** add an APNs Auth Key (`.p8`), the Key ID, and the Apple Team ID.

Then create a new dev-client or store build (`npx expo run:ios` / `run:android`, or EAS Build). Expo Go and simulators do not register a deliverable token; the app skips token registration there and keeps the in-app badge.

`expo-notifications` is a config plugin in both `app.json` files. iOS background mode `remote-notification` is set there too.

## 5. What the apps do without those credentials

Signed-in users can still send and read job messages after confirm, and cancel/status still insert `job_notifications`. The Alerts control shows the unread count. Opening the thread marks those alerts read. No code path sets a successful push without an Expo `ok` ticket.

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
- background check / auth flow for serviceprovider app200 gre

production checklist

- RLS on sql table
- website with qr codes
- dedicated email for help and verification emails
- financial model w 6 month projections
- remove logs?
- API keys restricted






