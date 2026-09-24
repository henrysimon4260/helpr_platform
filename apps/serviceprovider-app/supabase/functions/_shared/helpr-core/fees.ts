// Canonical: shared/helpr-core/fees.ts
// Edit there, then run: node scripts/sync-helpr-core.mjs
// Copies must stay byte-identical. Plan: docs/shared-status-fee-zone.md

/**
 * Checkout fee quote. Product rates, already used by select-helpr and the
 * customer payment summary:
 *   processing fee = 3% of the service price
 *   platform fee   = 1% of the service price
 *   customer pays  = price + processing fee + platform fee
 *
 * Each fee is rounded to the nearest cent, then the total is rounded to the
 * nearest cent. Do not switch this to 2.9% + $0.30 or to the unused 15%
 * complete-service flag.
 *
 * This is the quote clients may display. It is not a charge. Settlement
 * (what the provider is transferred) stays in the edge booking-fee module
 * from HLP-23 / PR #24. Sales tax stays in the HLP-58 edge module and is
 * not imported here. These fees are not the taxable base.
 */

export const PROCESSING_FEE_RATE = 0.03;
export const PLATFORM_FEE_RATE = 0.01;

export type BookingFeeQuote = {
  baseCents: number;
  processingFeeCents: number;
  platformFeeCents: number;
  chargeCents: number;
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

/** Cents charged at checkout. Null when the price cannot be quoted. */
export function bookingChargeCents(basePrice: number): number | null {
  return quoteBookingFees(basePrice)?.chargeCents ?? null;
}
