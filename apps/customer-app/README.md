# Customer App

## Quick start

```bash
pnpm install
pnpm expo start
```

## Configure the API keys

### Google Places (autocomplete + directions)

Autocomplete on the moving screen depends on the Google Places REST API. Provide a key via one of the following options:

1. Create a `.env.local` (or `.env`) file based on `.env.example` and add:

	```bash
	EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=your-google-key
	```

2. Alternatively, export the variable in your shell before starting Expo:

	```bash
	export EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=your-google-key
	pnpm expo start
	```

`app.config.ts` reads the value at build time and exposes it through `Constants.expoConfig.extra.googlePlacesApiKey`. If the key is missing, the moving screen falls back to manual entry only.

### OpenAI (pricing + voice mode)

Price estimates and the new speech-to-text workflow call the OpenAI API. Supply a key the same way:

```bash
EXPO_PUBLIC_OPENAI_API_KEY=your-openai-key
```

or set `OPENAI_API_KEY` in your shell before running Expo. The value is surfaced at runtime via `Constants.expoConfig.extra.openAiApiKey` and falls back to environment variables. Without it, price estimation and transcription will show a friendly warning and skip the API call.
