type PaymentIntentResponse = {
  paymentIntentId?: unknown;
  payment_intent_id?: unknown;
  data?: {
    paymentIntentId?: unknown;
    payment_intent_id?: unknown;
  } | null;
} | null | undefined;

/**
 * Stripe PaymentIntent id from create-payment-intent, or from client confirmation.
 * Returned only as a non-empty string so the booking update can store service.payment_intent_id.
 */
export function readPaymentIntentId(
  paymentIntentData: PaymentIntentResponse,
  confirmedPaymentIntentId?: string | null,
): string | null {
  const candidates = [
    paymentIntentData?.paymentIntentId,
    paymentIntentData?.payment_intent_id,
    paymentIntentData?.data?.paymentIntentId,
    paymentIntentData?.data?.payment_intent_id,
    confirmedPaymentIntentId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}
