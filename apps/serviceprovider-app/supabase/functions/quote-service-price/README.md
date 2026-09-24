# quote-service-price

Server-authoritative moving estimate (HLP-59). Moving only.

The function computes driving distance with the Google Distance Matrix API, then asks the model for a price range and job duration. Client fields such as `distanceMiles`, `price`, `priceMin`, and `priceMax` are ignored.

## Secrets

Set these on the Supabase project. Unit tests mock maps and the model, so CI does not need either key.

| Secret | Purpose |
| --- | --- |
| `GOOGLE_MAPS_API_KEY` | Distance Matrix. `GOOGLE_PLACES_API_KEY` is used if the maps key is unset. The key needs the Distance Matrix API enabled. |
| `OPENAI_API_KEY` | `gpt-4o-mini` structured JSON estimate. This is a server secret, not `EXPO_PUBLIC_OPENAI_API_KEY`. |

```bash
supabase secrets set GOOGLE_MAPS_API_KEY=... OPENAI_API_KEY=...
supabase functions deploy quote-service-price
```

## Tests

From `apps/serviceprovider-app`:

```bash
npm run test:quote-service-price
```

The suite uses a short-haul fixture (about 1.2 miles in Manhattan) and a long-haul fixture (New York to Boston, about 215 miles). The long haul must price and last longer than the short haul, and a client-sent distance must not win.
