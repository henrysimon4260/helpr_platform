# Customer App

## Quick start

```bash
npm install
npx expo start
```

### Google Places (autocomplete + directions)

Autocomplete on the moving screen depends on the Google Places REST API. Provide a key via one of the following options:

1. Create a `.env.local` (or `.env`) file based on `.env.example` and add:

	```bash
	EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=your-google-key
	```

2. Alternatively, export the variable in your shell before starting Expo:

	```bash
	export EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=your-google-key
	npm expo start
	```

`app.config.ts` reads the value at build time and exposes it through `Constants.expoConfig.extra.googlePlacesApiKey`. If the key is missing, the moving screen falls back to manual entry only.

### OpenAI (pricing + voice mode)

Price estimates and the new speech-to-text workflow call the OpenAI API. Supply a key the same way:

```bash
EXPO_PUBLIC_OPENAI_API_KEY=your-openai-key
```

or set `OPENAI_API_KEY` in your shell before running Expo. The value is surfaced at runtime via `Constants.expoConfig.extra.openAiApiKey` and falls back to environment variables. Without it, price estimation and transcription will show a friendly warning and skip the API call.

## Sign in

Phone SMS is the primary login. Email OTP and email/password remain on the same screen. Apple uses `expo-apple-authentication` on iOS (bundle ID `com.helpr.customer-app`) and Supabase OAuth on Android. Google uses Expo AuthSession: an ID token when `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, or `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is set for this platform, otherwise the Supabase Google browser flow.

Dashboard steps, redirect URLs (`customerapp://auth/callback`), and device checks are in the repo root [README](../../README.md#auth-phone-apple-google). Rebuild the dev client after pulling so the Sign in with Apple entitlement is in the binary.
