# Stripe webhooks and cancel refunds

Server-side payment status sync. No secret values belong in this repo.

## Endpoint

`https://hecikcopbdhhiilhgmrd.supabase.co/functions/v1/stripe-webhook`

Stripe Dashboard → Developers → Webhooks → Add endpoint. Use the URL above. Subscribe to:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.succeeded`
- `charge.failed`
- `charge.refunded`
- `refund.created`
- `refund.updated`
- `refund.failed`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `charge.dispute.funds_withdrawn`
- `charge.dispute.funds_reinstated`

After saving, reveal the signing secret (`whsec_...`). Test and live endpoints have different secrets.

## Environment variables

Set these on the Supabase function environment. Do not commit the values.

| Name | Used by | Notes |
| --- | --- | --- |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | Signing secret from the endpoint above. This is not `STRIPE_SECRET_KEY`. |
| `STRIPE_SECRET_KEY` | `refund-cancelled-payment` | Already used by `create-payment-intent` and `complete-service`. |
| `SUPABASE_URL` | both | Injected for hosted functions. |
| `SUPABASE_SERVICE_ROLE_KEY` | both | Injected for hosted functions. Also the Database Webhook bearer. Never ship this to a client. |

Example (value comes from the Dashboard, not from git):

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_replace_me
```

Apply `apps/serviceprovider-app/supabase/migrations/20260921190500_stripe_webhook_events.sql` before enabling the endpoint. The webhook stores Stripe event ids in `stripe_webhook_events`. A repeated event id does not write `payment_status` again.

`verify_jwt` is false for this function because Stripe cannot send a Supabase JWT. The handler rejects requests that fail signature verification.

## Cancel refunds

Customer cancel leaves `status = cancelled` and the existing `payment_intent_id`. It does not write `payment_status`.

Supabase Dashboard → Database → Webhooks:

- Table `public.service`, event Update
- URL `https://hecikcopbdhhiilhgmrd.supabase.co/functions/v1/refund-cancelled-payment`
- Header `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
- Header `Content-Type: application/json`

The function loads the row itself. It refunds a succeeded PaymentIntent, or cancels one that was never captured, and then writes `payment_status`. A body field named `payment_status` is ignored. Provider unassign (`finding_pros`) is not a refund.

`verify_jwt` stays true. The service role key is a project JWT, so the gateway accepts the webhook. An anon key is rejected in the handler.
