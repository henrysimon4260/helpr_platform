# helpr
a tasking app that determines a flat rate and provides a service provider to customer matching service

# install and run
run pnpm install from customer-app and service-provider directories
run npx expo run:ios (may need to rerun if there are port conflicts)

# Auth (phone, Apple, Google)

Login is phone-first. Email OTP and email/password stay available so existing sessions keep working. Apple and Google are real sign-in calls. If Apple or Google does not return a token, the app shows the error and does not invent one.

Project: `https://hecikcopbdhhiilhgmrd.supabase.co`

## Supabase dashboard

1. Authentication → Providers → Phone. Enable phone. Choose an SMS provider (Twilio, MessageBird, Vonage, or TextLocal) and save its credentials. Leave email provider enabled so current email OTP and password users can still sign in.
2. Authentication → Providers → Apple. Enable it. Under Client IDs add:
   - `com.helpr.customer-app`
   - `com.helpr.serviceprovider-app`
   - `host.exp.Exponent` only if you test in Expo Go
   Native iOS does not need the Apple secret. Android Apple sign-in uses the web OAuth flow, which does: create a Services ID, a Sign in with Apple key (`.p8`), and put the Services ID first in Client IDs. Apple requires that secret to be rotated every 6 months.
3. Authentication → Providers → Google. Enable it. Add the web client ID and secret from Google Cloud. For native ID tokens, also list the iOS and Android client IDs in Client IDs (comma-separated). Nonce checks stay on; the apps send a hashed nonce to the provider and the raw nonce to `signInWithIdToken`.
4. Authentication → URL configuration. Allow:
   - `customerapp://auth/callback`
   - `serviceproviderapp://auth/callback`
   Google's authorized redirect for the Supabase browser flow is `https://hecikcopbdhhiilhgmrd.supabase.co/auth/v1/callback`.

`customer.email` and `service_provider.email` should allow null so a phone-only account can insert a profile. Phone numbers are stored as E.164 on `auth.users.phone` and `customer.phone_number`. `service_provider.phone` stays numeric digits of that E.164 value (country code included, no `+`).

## Env vars

Optional. When the platform client ID is unset, Google uses the Supabase browser OAuth flow instead of an ID token.

```bash
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
```

Set them in each app's `.env` (see `.env.example`). After setting the iOS client ID, rebuild so `app.config.ts` can add the reversed URL scheme `com.googleusercontent.apps.<id>`.

## Google Cloud

1. OAuth consent screen: scopes `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
2. Web client: authorized redirect `https://hecikcopbdhhiilhgmrd.supabase.co/auth/v1/callback`. Put this client ID and secret in Supabase.
3. iOS clients, one per app, bundle IDs `com.helpr.customer-app` and `com.helpr.serviceprovider-app`.
4. Android clients, packages `com.helpr.customer_app` and `com.helpr.serviceprovider_app`, each with the debug and release SHA-1.
5. Copy the client IDs into the env vars above and into Supabase Google Client IDs.

Native Google redirect URIs the app requests:

- iOS: `com.googleusercontent.apps.<ios-client-id-without-suffix>:/oauthredirect`
- Android customer: `com.helpr.customer_app:/oauthredirect`
- Android provider: `com.helpr.serviceprovider_app:/oauthredirect`

## Apple Developer

1. App IDs `com.helpr.customer-app` and `com.helpr.serviceprovider-app` with Sign in with Apple enabled.
2. The customer iOS project already has the Sign in with Apple entitlement. Provider iOS is created on prebuild from `usesAppleSignIn` and the `expo-apple-authentication` plugin. Rebuild the dev client after pulling (`npx expo run:ios` in each app). Expo Go can test Apple only when `host.exp.Exponent` is in the Supabase client ID list.
3. For Android Apple sign-in, add a Services ID and the OAuth secret in Supabase as described above.

## Verify on a device

1. Rebuild and install a dev client. Expo Go cannot load `expo-apple-authentication` for a custom bundle ID.
2. Phone: enter a 10-digit US number or `+` international number, send the code, enter the SMS code. Confirm a `customer` or `service_provider` row exists and the phone is E.164 (customer) or the digits of that number (provider).
3. Email code and password: existing users can still sign in from the links under the primary button.
4. Apple on an iPhone signed into an Apple ID. Canceling the sheet should stay on login. A missing identity token shows an error.
5. Google: with client IDs unset, the in-app browser should return to the app only after Supabase redirects with a real session. With client IDs set, the app exchanges Google's code and refuses to continue if no ID token comes back.
6. This environment does not have the Apple Developer key or Google OAuth client secrets, so those two providers cannot be completed here. The buttons call the real APIs and stop when the token is missing.

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






