import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PLATFORM_FEE_RATE as serverPlatformRate,
  PROCESSING_FEE_RATE as serverProcessingRate,
  quoteBookingFees as serverQuote,
  settleBookingFees,
} from './bookingFees.ts';
import {
  PLATFORM_FEE_RATE as clientPlatformRate,
  PROCESSING_FEE_RATE as clientProcessingRate,
  quoteBookingFees as clientQuote,
} from '../../../../customer-app/src/components/services/PaymentSummaryModal/fees.ts';
import { bookingChargeCents } from './autofillPayment.ts';

/** Inlined select-helpr total. That screen is not edited from this lane. */
function selectHelprChargeCents(basePrice) {
  const processingFee = Math.round(basePrice * 0.03 * 100) / 100;
  const platformFee = Math.round(basePrice * 0.01 * 100) / 100;
  const totalAmount = Math.round((basePrice + processingFee + platformFee) * 100) / 100;
  return Math.round(totalAmount * 100);
}

const prices = [0.5, 1, 10, 10.1, 10.116, 25, 30.49, 40, 99.99, 100, 250.75];

test('checkout, summary, and select-helpr use one 3% + 1% quote', () => {
  assert.equal(serverProcessingRate, 0.03);
  assert.equal(serverPlatformRate, 0.01);
  assert.equal(clientProcessingRate, serverProcessingRate);
  assert.equal(clientPlatformRate, serverPlatformRate);

  for (const price of prices) {
    const server = serverQuote(price);
    const client = clientQuote(price);
    assert.deepEqual(client, server);
    assert.equal(server.chargeCents, bookingChargeCents(price));
    assert.equal(server.chargeCents, selectHelprChargeCents(price));
  }

  assert.equal(serverQuote(100).chargeCents, 10400);
  assert.equal(serverQuote(100).processingFeeCents, 300);
  assert.equal(serverQuote(100).platformFeeCents, 100);
  assert.equal(serverQuote(10.1).chargeCents, 1050);
  assert.equal(serverQuote(0), null);
  assert.equal(serverQuote(-5), null);
  assert.equal(clientQuote(Number.NaN), null);
});

test('small bids cannot transfer more than the charge minus the Stripe fee', () => {
  const quote = serverQuote(10);
  assert.equal(quote.chargeCents, 1040);
  assert.equal(quote.baseCents, 1000);

  const settled = settleBookingFees({
    baseCents: quote.baseCents,
    platformFeeCents: quote.platformFeeCents,
    processingFeeCents: quote.processingFeeCents,
    chargeCents: quote.chargeCents,
    stripeFeeCents: 60,
  });

  assert.equal(settled.availableCents, 980);
  assert.equal(settled.providerTransferCents, 980);
  assert.equal(settled.netPlatformFeeCents, 0);
  assert.ok(settled.providerTransferCents <= settled.availableCents);
  assert.ok(settled.providerTransferCents < quote.baseCents);
});

test('larger bids still pay the service price and keep the remainder', () => {
  const quote = serverQuote(100);
  const settled = settleBookingFees({
    baseCents: quote.baseCents,
    platformFeeCents: quote.platformFeeCents,
    processingFeeCents: quote.processingFeeCents,
    chargeCents: quote.chargeCents,
    stripeFeeCents: 332,
  });

  assert.equal(settled.providerTransferCents, 10000);
  assert.equal(settled.availableCents, 10068);
  assert.equal(settled.netPlatformFeeCents, 68);
  assert.ok(settled.providerTransferCents <= settled.availableCents);
});

test('refunds and prior transfers reduce what can be paid out', () => {
  const settled = settleBookingFees({
    baseCents: 5000,
    platformFeeCents: 50,
    processingFeeCents: 150,
    chargeCents: 5200,
    stripeFeeCents: 100,
    amountRefundedCents: 200,
    alreadyTransferredCents: 1000,
  });

  assert.equal(settled.availableCents, 3900);
  assert.equal(settled.providerTransferCents, 3900);
  assert.equal(settled.netPlatformFeeCents, 0);
});

test('a charge that cannot cover the Stripe fee transfers nothing', () => {
  const quote = serverQuote(0.5);
  const settled = settleBookingFees({
    baseCents: quote.baseCents,
    platformFeeCents: quote.platformFeeCents,
    processingFeeCents: quote.processingFeeCents,
    chargeCents: quote.chargeCents,
    stripeFeeCents: quote.chargeCents,
  });

  assert.equal(settled.providerTransferCents, 0);
  assert.equal(settled.availableCents, 0);
  assert.equal(settleBookingFees({
    baseCents: 1000,
    platformFeeCents: 10,
    processingFeeCents: 30,
    chargeCents: 1040,
    stripeFeeCents: 10.5,
  }), null);
});
