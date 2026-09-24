# support-chat

Helpr support Q&A for both apps and the website. Request and response shapes are in [`JOB_CONTRACT.md`](../../../../../JOB_CONTRACT.md).

The model key stays on the server. Do not set `EXPO_PUBLIC_OPENAI_API_KEY` or `NEXT_PUBLIC_OPENAI_API_KEY` for this bot. Those client names are not read here. Price estimation in the customer app is a separate, existing use of `EXPO_PUBLIC_OPENAI_API_KEY`.

## Secret

Name: `OPENAI_API_KEY`

Production (from `apps/serviceprovider-app`, linked to project `hecikcopbdhhiilhgmrd`):

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase functions deploy support-chat
```

Dashboard: Project → Edge Functions → Secrets. Add `OPENAI_API_KEY`. Secrets are available to deployed functions without a second deploy.

Owner or Administrator role is required to create the secret. `supabase secrets list` shows names, not values.

Local serve reads `supabase/functions/.env` (gitignored). Copy `.env.example` in this folder's parent to `.env` and set the key, then:

```bash
supabase functions serve support-chat --env-file supabase/functions/.env
```

If `OPENAI_API_KEY` is missing, the function returns HTTP 503:

```json
{ "error": "support_unavailable", "message": "Support chat is unavailable because OPENAI_API_KEY is not set on the support-chat function. Nothing was answered." }
```

## Call

`verify_jwt` stays true. Send the project anon key or a user JWT. The apps do this through `supabase.functions.invoke('support-chat', { body })`.

```bash
curl -X POST 'https://hecikcopbdhhiilhgmrd.supabase.co/functions/v1/support-chat' \
  -H 'apikey: YOUR_ANON_KEY' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"audience":"customer","channel":"app","messages":[{"role":"user","content":"What fees does Helpr charge?"}]}'
```

A missing function (not deployed yet) is a reachability error in the apps. They show that error and do not insert a fake assistant reply.

## Tests

```bash
node --experimental-strip-types --test apps/serviceprovider-app/supabase/functions/support-chat/support-bot.test.ts
npm test --prefix website
```

## Website

`POST /api/support-chat` uses this function when both `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set on the website server. Otherwise it calls OpenAI with the same prompt when `OPENAI_API_KEY` is set on the website. If neither path is configured, the site returns the same `support_unavailable` error. The contact form still sends email only when SMTP is configured.
