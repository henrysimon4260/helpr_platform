import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import {
  STRIPE_SIGNATURE_TOLERANCE_SECONDS,
  WEBHOOK_CLAIM_STALE_MS,
  claimAction,
  eventPaymentIntentId,
  metadataServiceId,
  nextPaymentStatus,
  readStripeEvent,
  servicePaymentPatch,
  verifyStripeWebhookSignature,
} from './stripeWebhook.ts';

const SECRET = 'whsec_test_secret';

function sign(payload, secret, timestamp) {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

test('signature matches an independent HMAC and rejects tampering', async () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
  const now = 1_700_000_000;
  const header = sign(payload, SECRET, now);
  assert.equal(STRIPE_SIGNATURE_TOLERANCE_SECONDS, 300);

  const valid = await verifyStripeWebhookSignature({
    payload,
    header,
    secret: SECRET,
    nowUnix: now,
  });
  assert.deepEqual(valid, { ok: true });

  const tampered = await verifyStripeWebhookSignature({
    payload: `${payload} `,
    header,
    secret: SECRET,
    nowUnix: now,
  });
  assert.equal(tampered.ok, false);
  assert.equal(tampered.reason, 'mismatch');

  const wrongSecret = await verifyStripeWebhookSignature({
    payload,
    header,
    secret: 'whsec_other',
    nowUnix: now,
  });
  assert.equal(wrongSecret.reason, 'mismatch');
});

test('signature ignores v0 and accepts one matching v1 among several', async () => {
  const payload = '{"id":"evt_2"}';
  const now = 1_700_000_100;
  const v1 = sign(payload, SECRET, now).split('v1=')[1];
  const header = `t=${now},v0=deadbeef,v1=not-the-signature,v1=${v1}`;
  const valid = await verifyStripeWebhookSignature({
    payload,
    header,
    secret: SECRET,
    nowUnix: now,
  });
  assert.deepEqual(valid, { ok: true });

  const onlyV0 = await verifyStripeWebhookSignature({
    payload,
    header: `t=${now},v0=${v1}`,
    secret: SECRET,
    nowUnix: now,
  });
  assert.equal(onlyV0.reason, 'malformed');
});

test('stale signatures are rejected and a 5 minute old signature is accepted', async () => {
  const payload = '{}';
  const now = 1_700_000_500;
  const fresh = await verifyStripeWebhookSignature({
    payload,
    header: sign(payload, SECRET, now - STRIPE_SIGNATURE_TOLERANCE_SECONDS),
    secret: SECRET,
    nowUnix: now,
  });
  assert.equal(fresh.ok, true);

  const stale = await verifyStripeWebhookSignature({
    payload,
    header: sign(payload, SECRET, now - STRIPE_SIGNATURE_TOLERANCE_SECONDS - 1),
    secret: SECRET,
    nowUnix: now,
  });
  assert.equal(stale.reason, 'stale');
});

test('missing header or secret fails before a status write would be allowed', async () => {
  const missingHeader = await verifyStripeWebhookSignature({
    payload: '{}',
    header: null,
    secret: SECRET,
    nowUnix: 10,
  });
  assert.equal(missingHeader.reason, 'missing_header');

  const missingSecret = await verifyStripeWebhookSignature({
    payload: '{}',
    header: 't=10,v1=abc',
    secret: '',
    nowUnix: 10,
  });
  assert.equal(missingSecret.reason, 'missing_secret');
});

test('claim action stores an event id once and retries errors', () => {
  const now = 10_000;
  assert.equal(claimAction(null, now), 'insert');
  assert.equal(claimAction({ outcome: 'processed', receivedAtMs: now }, now), 'duplicate');
  assert.equal(claimAction({ outcome: 'ignored', receivedAtMs: now }, now), 'duplicate');
  assert.equal(claimAction({ outcome: 'error', receivedAtMs: now }, now), 'takeover');
  assert.equal(
    claimAction({ outcome: 'processing', receivedAtMs: now - 1_000 }, now),
    'retry_later',
  );
  assert.equal(
    claimAction({ outcome: 'processing', receivedAtMs: now - WEBHOOK_CLAIM_STALE_MS }, now),
    'takeover',
  );
});

test('payment status follows Stripe events and ignores a client payment_status field', () => {
  const poisoned = {
    id: 'pi_1',
    payment_status: 'refunded',
    metadata: { payment_status: 'refunded', service_id: 'svc-1' },
  };
  assert.equal(nextPaymentStatus('payment_intent.succeeded', poisoned, null), 'paid');
  assert.equal(nextPaymentStatus('charge.succeeded', { payment_intent: 'pi_1' }, 'failed'), 'paid');
  assert.equal(nextPaymentStatus('payment_intent.succeeded', poisoned, 'refunded'), null);
  assert.equal(nextPaymentStatus('payment_intent.succeeded', poisoned, 'disputed'), null);
  assert.equal(nextPaymentStatus('payment_intent.succeeded', poisoned, 'dispute_lost'), null);
  assert.equal(nextPaymentStatus('payment_intent.payment_failed', poisoned, null), 'failed');
  assert.equal(nextPaymentStatus('charge.failed', poisoned, 'paid'), null);
  assert.equal(nextPaymentStatus('payment_intent.canceled', { id: 'pi_1' }, null), 'canceled');
  assert.equal(nextPaymentStatus('payment_intent.canceled', { id: 'pi_1' }, 'paid'), null);

  assert.equal(
    nextPaymentStatus('charge.refunded', { amount: 1000, amount_refunded: 1000 }, 'paid'),
    'refunded',
  );
  assert.equal(
    nextPaymentStatus('charge.refunded', { amount: 1000, amount_refunded: 100 }, 'paid'),
    'partially_refunded',
  );
  assert.equal(nextPaymentStatus('refund.created', { status: 'pending' }, 'paid'), 'refund_pending');
  assert.equal(nextPaymentStatus('refund.failed', { status: 'failed' }, 'refund_pending'), 'paid');
  assert.equal(nextPaymentStatus('refund.failed', { status: 'failed' }, 'refunded'), null);

  assert.equal(nextPaymentStatus('charge.dispute.created', { status: 'needs_response' }, 'paid'), 'disputed');
  assert.equal(nextPaymentStatus('charge.dispute.closed', { status: 'won' }, 'disputed'), 'paid');
  assert.equal(nextPaymentStatus('charge.dispute.closed', { status: 'lost' }, 'disputed'), 'dispute_lost');
  assert.equal(nextPaymentStatus('charge.dispute.closed', { status: 'charge_refunded' }, 'disputed'), 'refunded');
  assert.equal(nextPaymentStatus('charge.dispute.funds_reinstated', {}, 'disputed'), 'paid');
  assert.equal(nextPaymentStatus('customer.created', { payment_status: 'paid' }, null), null);
});

test('a mismatched PaymentIntent does not patch the service', () => {
  assert.deepEqual(servicePaymentPatch({
    nextStatus: 'paid',
    eventPaymentIntentId: 'pi_new',
    storedPaymentIntentId: 'pi_old',
  }), null);
  assert.deepEqual(servicePaymentPatch({
    nextStatus: 'paid',
    eventPaymentIntentId: 'pi_new',
    storedPaymentIntentId: null,
  }), { payment_status: 'paid', payment_intent_id: 'pi_new' });
  assert.equal(servicePaymentPatch({
    nextStatus: null,
    eventPaymentIntentId: 'pi_new',
    storedPaymentIntentId: null,
  }), null);
});

test('event identity comes from the Stripe object, not a payment_status field', () => {
  const event = readStripeEvent({
    id: 'evt_9',
    type: 'charge.dispute.created',
    data: { object: { id: 'dp_1', payment_intent: 'pi_9', metadata: { service_id: 'svc-9' } } },
  });
  assert.equal(event.id, 'evt_9');
  assert.equal(metadataServiceId(event.object), 'svc-9');
  assert.equal(eventPaymentIntentId(event.type, event.object), 'pi_9');
  assert.equal(eventPaymentIntentId('payment_intent.succeeded', { id: 'pi_3' }), 'pi_3');
  assert.equal(eventPaymentIntentId('charge.refunded', { payment_intent: { id: 'pi_4' } }), 'pi_4');
  assert.equal(readStripeEvent({ id: 'evt', type: 'x' }), null);
});
