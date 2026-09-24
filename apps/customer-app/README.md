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

### OpenAI (voice mode) and server quotes

Moving and cleaning price estimates do not call OpenAI from the app. The moving screen sends pickup and drop-off to the `quote-service-price` edge function, which computes driving distance and returns the price range. The cleaning screen sends home size (square feet and/or bedroom and bathroom counts) to the same function. The server needs `OPENAI_API_KEY`. Moving also needs `GOOGLE_MAPS_API_KEY` (see `apps/serviceprovider-app/supabase/functions/quote-service-price/README.md`). Speech-to-text still calls OpenAI from the app. Supply a key the same way:

```bash
EXPO_PUBLIC_OPENAI_API_KEY=your-openai-key
```

or set `OPENAI_API_KEY` in your shell before running Expo. The value is surfaced at runtime via `Constants.expoConfig.extra.openAiApiKey` and falls back to environment variables. Without it, transcription shows a friendly warning and skips the API call. Other service forms still estimate from the device key; moving and cleaning do not.
