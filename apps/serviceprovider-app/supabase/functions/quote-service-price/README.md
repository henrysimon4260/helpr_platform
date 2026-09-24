# quote-service-price

Server-authoritative estimates for moving (HLP-59) and cleaning (HLP-60).

Moving computes driving distance with the Google Distance Matrix API, then asks the model for a price range and job duration. Client fields such as `distanceMiles`, `price`, `priceMin`, and `priceMax` are ignored.

Cleaning does not use maps. The model prices from home size: square feet and/or bedroom and bathroom counts (a studio is `bedrooms: 0`). Optional inputs are condition, pet hair, standard vs deep, and frequency. Client `price`, `priceMin`, `priceMax`, `suggestedPrice`, and `durationMinutes` are ignored. A larger apartment must return a higher range and a longer duration than a studio.

## Secrets

Set these on the Supabase project. Unit tests mock maps and the model, so CI does not need either key.

| Secret | Purpose |
| --- | --- |
| `GOOGLE_MAPS_API_KEY` | Moving only. Distance Matrix. `GOOGLE_PLACES_API_KEY` is used if the maps key is unset. The key needs the Distance Matrix API enabled. Cleaning does not call maps. |
| `OPENAI_API_KEY` | `gpt-4o-mini` structured JSON estimate for moving and cleaning. This is a server secret, not `EXPO_PUBLIC_OPENAI_API_KEY`. |

```bash
supabase secrets set GOOGLE_MAPS_API_KEY=... OPENAI_API_KEY=...
supabase functions deploy quote-service-price
```

## Tests

From `apps/serviceprovider-app`:

```bash
npm run test:quote-service-price
```

Moving uses a short-haul fixture (about 1.2 miles in Manhattan) and a long-haul fixture (New York to Boston, about 215 miles). The long haul must price and last longer than the short haul, and a client-sent distance must not win.

Cleaning uses a studio fixture (450 sq ft, 0 bedrooms, 1 bathroom) and a large-apartment fixture (2400 sq ft, 4 bedrooms, 3 bathrooms). The large apartment must price and last longer than the studio, and a client-sent price or duration must not win.
