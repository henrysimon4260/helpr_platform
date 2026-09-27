# Helpr Happiness operations playbook

Helpr Happiness is discretionary goodwill. It is not insurance. Do not tell a customer they are covered by a Helpr policy, and do not quote a licensed limit. Say "goodwill", "request", and "up to $1,000".

This path is not a billing refund or a card dispute (HLP-64). Do not change `service.status` or `service.payment_status` when you resolve a request.

## Before you decide

1. Open the `helpr_happiness_claim` row and the related `service` row.
2. Confirm the job `status` is `completed` and `payment_status` is `paid`. The database rejects new requests that fail this check. Still confirm it before paying.
3. Confirm the request was filed within 30 days of `coalesce(completed_at, date_of_creation)`.
4. Read `narrative`, `evidence_notes`, and `own_coverage_notes`.
5. Open files in the private bucket `happiness-claim-evidence`. Paths look like `{customer_id}/{claim_id}/{file}`. Use the Supabase dashboard or a service-role client. Do not make the bucket public.
6. Walk the exclusion list in `JOB_CONTRACT.md`. If one applies, decline the request and name the exclusion in plain language.
7. If the customer has not asked their own homeowner's or renter's insurer and the loss might belong there, set the decision to `needs_info` and ask them to try that policy first. Goodwill is secondary.

## Outcomes

Call `resolve-happiness-claim`. One call records the outcome.

| Decision | When | Payout |
| --- | --- | --- |
| `needs_info` | The file is incomplete, or their own insurer should be asked first. | None. |
| `deny` | An exclusion applies, the loss is not from the Helpr's negligence, or the story is not credible. | None. |
| `approve` | The loss fits the program. Pays the requested amount, which cannot be above $1,000. | `stripe_refund` or `manual`. |
| `partial` | Pay less than the request, still not above $1,000. Send `amountApprovedCents`. | `stripe_refund` or `manual`. |

`notes` is required (at least a short sentence). Those notes are stored on the row and may be shown to the customer. Do not call the program insurance in the note.

### Stripe refund

Use `stripe_refund` only to return money from the card charge on that job, up to the amount Stripe can still refund. If the goodwill amount is higher than the refundable charge, do not force the refund. Record `manual` instead, or lower the amount with `partial`.

The refund metadata key `kind` is `helpr_happiness`. That marks it as goodwill, not a payment dispute.

### Manual record

`manual` does not move money in Stripe. Send the payment through the finance process you already use, then record it. If finance has not sent it yet, say that in `notes`. The row is the book of record either way.

## Calling the function

Set the server secret `HELPR_OPS_KEY`. The customer app never sees this value.

```bash
curl -X POST "$SUPABASE_URL/functions/v1/resolve-happiness-claim" \
  -H "Content-Type: application/json" \
  -H "x-helpr-ops-key: $HELPR_OPS_KEY" \
  -d '{
    "claimId": "CLAIM_UUID",
    "decision": "partial",
    "amountApprovedCents": 25000,
    "payoutMethod": "manual",
    "notes": "Paid part of the furniture repair. Water damage is outside the program, so the rest was declined."
  }'
```

A staff user whose `app_metadata.role` is `ops` may call the function with their user JWT instead of the ops key. Do not put that role in `user_metadata`.

Resolved rows (`paid` or `denied`) cannot be decided again. If a Stripe refund succeeds and the row update fails, retry the same body. The refund uses an idempotency key of `helpr-happiness-{claimId}`.

## Customer language

Use:

- "Helpr Happiness is discretionary goodwill and it is not insurance."
- "Any help is secondary to your own homeowner's or renter's insurance."
- "We approved a goodwill payment of $250." or "We declined this request."

Do not say the customer is insured, do not quote a policy limit, and do not say that Helpr insurance will pay. The cap is a goodwill ceiling, not a coverage promise.
