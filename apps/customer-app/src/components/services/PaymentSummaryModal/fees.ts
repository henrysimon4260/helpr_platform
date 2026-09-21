/**
 * Customer-facing copy of the booking fee quote.
 *
 * Source of truth for charge and settlement:
 * apps/serviceprovider-app/supabase/functions/_shared/bookingFees.ts
 *
 * Rates: 3% payment processing and 1% platform, each rounded to the nearest
 * cent, then the total rounded to the nearest cent. This is not 2.9% + $0.30
 * and not the unused 15% complete-service flag. bookingFees.test.mjs fails if
 * this copy drifts from the edge-function helper.
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
