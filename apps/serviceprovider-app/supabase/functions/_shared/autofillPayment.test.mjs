import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  authUserIdsForEmail,
  bookingChargeCents,
  buildAutoFillConfirmUpdate,
  canVoidUnclaimedPayment,
  isAlreadyRefunded,
  parseBidDollars,
  pickSavedPaymentMethodId,
  readPaymentIntentId,
  readPaymentStatus,
  unclaimedPaymentRelease,
} from './autofillPayment.ts';

test('charges the select-helpr total in cents', () => {
  assert.equal(bookingChargeCents(100), 10400);
  assert.equal(bookingChargeCents(10.1), 1050);
});

test('rejects bids that cannot be charged', () => {
  assert.equal(bookingChargeCents(0), null);
  assert.equal(bookingChargeCents(-5), null);
  assert.equal(bookingChargeCents(Number.NaN), null);
});

test('parses fill-request bids', () => {
  assert.equal(parseBidDollars(42), 42);
  assert.equal(parseBidDollars('80.50'), 80.5);
  assert.equal(parseBidDollars('$15'), 15);
  assert.equal(parseBidDollars(''), null);
  assert.equal(parseBidDollars(null), null);
});

test('reads paymentIntentId from create-payment-intent', () => {
  assert.equal(readPaymentIntentId({ paymentIntentId: 'pi_server', status: 'succeeded' }), 'pi_server');
});

test('reads snake_case and nested ids', () => {
  assert.equal(readPaymentIntentId({ payment_intent_id: 'pi_snake' }), 'pi_snake');
  assert.equal(readPaymentIntentId({ data: { paymentIntentId: 'pi_nested' } }), 'pi_nested');
});

test('skips empty or non-string ids', () => {
  assert.equal(readPaymentIntentId({ paymentIntentId: '', payment_intent_id: 'pi_next' }), 'pi_next');
  assert.equal(readPaymentIntentId({ paymentIntentId: 12 }, 'pi_confirmed'), 'pi_confirmed');
  assert.equal(readPaymentIntentId({}), null);
  assert.equal(readPaymentIntentId(undefined, ''), null);
});

test('reads payment status from the charge response', () => {
  assert.equal(readPaymentStatus({ status: 'succeeded' }), 'succeeded');
  assert.equal(readPaymentStatus({ data: { status: 'requires_action' } }), 'requires_action');
  assert.equal(readPaymentStatus(null), null);
});

test('confirm update requires a payment intent id and paid status', () => {
  const update = buildAutoFillConfirmUpdate({
    providerId: 'provider-1',
    price: 80,
    paymentIntentId: 'pi_autofill',
    scheduledDateTime: '2026-09-22T15:00:00.000Z',
  });

  assert.deepEqual(update, {
    service_provider_id: 'provider-1',
    status: 'confirmed',
    price: 80,
    scheduling_type: 'scheduled',
    scheduled_date_time: '2026-09-22T15:00:00.000Z',
    payment_status: 'paid',
    payment_intent_id: 'pi_autofill',
  });
});

test('does not confirm without a payment intent id', () => {
  const base = {
    providerId: 'provider-1',
    price: 80,
    scheduledDateTime: null,
  };

  assert.equal(buildAutoFillConfirmUpdate({ ...base, paymentIntentId: null }), null);
  assert.equal(buildAutoFillConfirmUpdate({ ...base, paymentIntentId: '' }), null);
  assert.equal(buildAutoFillConfirmUpdate({ ...base, paymentIntentId: 'pi_ok', price: 0 }), null);
  assert.equal(buildAutoFillConfirmUpdate({ ...base, paymentIntentId: 'pi_ok', providerId: '' }), null);
});

test('picks the default saved card, then the oldest', () => {
  assert.equal(pickSavedPaymentMethodId([
    { stripe_pm_id: 'pm_old', is_default: false, created_at: '2026-01-01T00:00:00.000Z' },
    { stripe_pm_id: 'pm_default', is_default: true, created_at: '2026-03-01T00:00:00.000Z' },
  ]), 'pm_default');

  assert.equal(pickSavedPaymentMethodId([
    { stripe_pm_id: 'pm_newer', is_default: false, created_at: '2026-04-01T00:00:00.000Z' },
    { stripe_pm_id: 'pm_older', is_default: false, created_at: '2026-01-01T00:00:00.000Z' },
  ]), 'pm_older');

  assert.equal(pickSavedPaymentMethodId([{ stripe_pm_id: '' }, { is_default: true }]), null);
});

test('matches auth users by exact email', () => {
  const payload = {
    users: [
      { id: 'user-1', email: 'Customer@Example.com' },
      { id: 'user-2', email: 'other@example.com' },
      { id: '', email: 'customer@example.com' },
    ],
  };

  assert.deepEqual(authUserIdsForEmail(payload, 'customer@example.com'), ['user-1']);
  assert.deepEqual(authUserIdsForEmail({ users: [] }, 'customer@example.com'), []);
});

test('refuses to void a payment intent already on a workable job', () => {
  assert.equal(canVoidUnclaimedPayment({
    status: 'confirmed',
    payment_intent_id: 'pi_winner',
  }, 'pi_winner'), false);
  assert.equal(canVoidUnclaimedPayment({
    status: 'in_progress',
    payment_intent_id: 'pi_winner',
  }, 'pi_winner'), false);
  assert.equal(canVoidUnclaimedPayment({
    status: 'finding_pros',
    payment_intent_id: 'pi_early',
  }, 'pi_early'), true);
  assert.equal(canVoidUnclaimedPayment({
    status: 'confirmed',
    payment_intent_id: 'pi_winner',
  }, 'pi_loser'), true);
});

test('releases a captured charge with a refund and an open one with cancel', () => {
  assert.equal(unclaimedPaymentRelease('succeeded'), 'refund');
  assert.equal(unclaimedPaymentRelease('requires_action'), 'cancel');
  assert.equal(unclaimedPaymentRelease('requires_capture'), 'cancel');
  assert.equal(unclaimedPaymentRelease('canceled'), 'none');
  assert.equal(unclaimedPaymentRelease('processing'), 'unsupported');
});

test('treats an already-refunded Stripe error as released', () => {
  assert.equal(isAlreadyRefunded({ code: 'charge_already_refunded' }), true);
  assert.equal(isAlreadyRefunded({ code: 'card_declined' }), false);
});
