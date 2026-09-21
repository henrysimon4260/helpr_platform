/**
 * Booking fee model shared by create-payment-intent and complete-service.
 *
 * Product rates already charged at checkout and shown on the customer summary:
 *   processing fee = 3% of the service price (the accepted bid)
 *   platform fee   = 1% of the service price
 *   customer pays  = price + processing fee + platform fee
 *
 * Each fee is rounded to the nearest cent, then the total is rounded to the
 * nearest cent. That is the historical select-helpr / bookingChargeCents rule.
 * Do not switch this to 2.9% + $0.30 or to the unused 15% client flag.
 *
 * The customer summary copies this quote in
 * apps/customer-app/src/components/services/PaymentSummaryModal/fees.ts.
 * bookingFees.test.mjs fails if the two copies diverge.
 *
 * complete-service records the Stripe charge amount and the balance-transaction
 * fee. The provider transfer is the service price, capped so it cannot exceed
 * the charge minus refunds minus that Stripe fee.
 */

export const PROCESSING_FEE_RATE = 0.03;
export const PLATFORM_FEE_RATE = 0.01;

export type BookingFeeQuote = {
  baseCents: number;
  processingFeeCents: number;
  platformFeeCents: number;
  chargeCents: number;
};

export type SettlementQuote = {
  baseCents: number;
  chargeCents: number;
  platformFeeCents: number;
  processingFeeCents: number;
  stripeFeeCents: number;
  amountRefundedCents: number;
  alreadyTransferredCents: number;
  availableCents: number;
  providerTransferCents: number;
  netPlatformFeeCents: number;
};

export function quoteBookingFees(basePrice: number): BookingFeeQuote | null {
  if (!Number.isFinite(basePrice) || basePrice <= 0) return null;

  const processingFee = Math.round(basePrice * PROCESSING_FEE_RATE * 100) / 100;
  const platformFee = Math.round(basePrice * PLATFORM_FEE_RATE * 100) / 100;
  const totalAmount = Math.round((basePrice + processingFee + platformFee) * 100) / 100;
  const chargeCents = Math.round(totalAmount * 100);
  if (!Number.isInteger(chargeCents) || chargeCents <= 0) return null;

  const baseCents = Math.round(basePrice * 100);
  const processingFeeCents = Math.round(processingFee * 100);
  const platformFeeCents = Math.round(platformFee * 100);
  if (baseCents <= 0 || processingFeeCents < 0 || platformFeeCents < 0) return null;

  return { baseCents, processingFeeCents, platformFeeCents, chargeCents };
}

/** Cents create-payment-intent charges. Null when the price cannot be charged. */
export function bookingChargeCents(basePrice: number): number | null {
  return quoteBookingFees(basePrice)?.chargeCents ?? null;
}

function isNonNegativeInt(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Provider is owed the service price. The transfer cannot exceed funds left
 * on the captured charge after refunds and Stripe's fee.
 */
export function settleBookingFees(input: {
  baseCents: number;
  platformFeeCents: number;
  processingFeeCents: number;
  chargeCents: number;
  stripeFeeCents: number;
  amountRefundedCents?: number;
  alreadyTransferredCents?: number;
}): SettlementQuote | null {
  const amountRefundedCents = input.amountRefundedCents ?? 0;
  const alreadyTransferredCents = input.alreadyTransferredCents ?? 0;
  if (
    !isNonNegativeInt(input.baseCents) || input.baseCents <= 0
    || !isNonNegativeInt(input.platformFeeCents)
    || !isNonNegativeInt(input.processingFeeCents)
    || !isNonNegativeInt(input.chargeCents) || input.chargeCents <= 0
    || !isNonNegativeInt(input.stripeFeeCents)
    || !isNonNegativeInt(amountRefundedCents)
    || !isNonNegativeInt(alreadyTransferredCents)
  ) {
    return null;
  }

  const availableCents = Math.max(
    0,
    input.chargeCents - amountRefundedCents - input.stripeFeeCents - alreadyTransferredCents,
  );
  const providerTransferCents = Math.min(input.baseCents, availableCents);

  return {
    baseCents: input.baseCents,
    chargeCents: input.chargeCents,
    platformFeeCents: input.platformFeeCents,
    processingFeeCents: input.processingFeeCents,
    stripeFeeCents: input.stripeFeeCents,
    amountRefundedCents,
    alreadyTransferredCents,
    availableCents,
    providerTransferCents,
    netPlatformFeeCents: availableCents - providerTransferCents,
  };
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}
