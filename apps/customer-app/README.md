# Customer App

## Quick start

```bash
pnpm install
pnpm expo start
```

## Configure the Google Places API key

Autocomplete on the moving screen depends on the Google Places REST API. Provide a key via one of the following options:

1. Create a `.env.local` (or `.env`) file based on `.env.example` and add:

	```bash
	EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=your-key-here
	```

2. Alternatively, export the variable in your shell before starting Expo:

	```bash
	export EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=your-key-here
	pnpm expo start
	```

The new `app.config.ts` reads the value at build time and makes it available to the app through `Constants.expoConfig.extra.googlePlacesApiKey`. If the key is missing, the moving screen will warn and autocomplete will return no results.
