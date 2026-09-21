import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  authorizeRefundCaller,
  cancelPaymentIntentIdempotencyKey,
  paymentStatusAfterRefundCreate,
  readRefundServiceId,
  refundBlockedByPayout,
  refundHttpResult,
  refundIdempotencyKey,
  releaseCancelledPayment,
  secretsMatch,
} from './cancelledRefund.ts';

function fakeStripe(status, extras = {}) {
  const calls = [];
  const stripe = {
    calls,
    paymentIntents: {
      retrieve: async (id) => ({
        id,
        status,
        metadata: extras.metadata === undefined ? { service_id: 'svc-1' } : extras.metadata,
      }),
      cancel: async (id, params, options) => {
        calls.push({ method: 'cancel', id, params, options });
        return { status: 'canceled' };
      },
    },
    refunds: {
      create: async (params, options) => {
        calls.push({ method: 'refund', params, options });
        if (extras.refundError) throw extras.refundError;
        return { id: 're_1', status: extras.refundStatus || 'succeeded' };
      },
    },
  };
  return stripe;
}

test('service role and the owning customer may refund; a body payment_status is not a service id', () => {
  assert.equal(secretsMatch('service-role-key', 'service-role-key'), true);
  assert.equal(secretsMatch('service-role-key', 'anon-key'), false);
  assert.equal(secretsMatch('', 'service-role-key'), false);

  assert.deepEqual(authorizeRefundCaller({ isServiceRole: true, signedIn: false, ownsService: false }), {
    ok: true,
    via: 'service_role',
  });
  assert.equal(authorizeRefundCaller({ isServiceRole: false, signedIn: true, ownsService: true }).via, 'customer');
  assert.equal(authorizeRefundCaller({ isServiceRole: false, signedIn: false, ownsService: false }).status, 401);
  assert.equal(authorizeRefundCaller({ isServiceRole: false, signedIn: true, ownsService: false }).status, 403);

  assert.equal(readRefundServiceId({ payment_status: 'refunded' }), null);
  assert.equal(readRefundServiceId({ service_id: 'svc-1', payment_status: 'paid' }), 'svc-1');
  assert.equal(readRefundServiceId({
    record: { service_id: 'svc-2', payment_status: 'paid', status: 'cancelled' },
  }), 'svc-2');
});

test('a cancelled succeeded charge is refunded once and an uncaptured charge is canceled', async () => {
  const succeeded = fakeStripe('succeeded');
  const refunded = await releaseCancelledPayment(succeeded, {
    serviceId: 'svc-1',
    serviceStatus: 'cancelled',
    paymentIntentId: 'pi_1',
  });
  assert.equal(refunded.ok, true);
  assert.equal(refunded.action, 'refund');
  assert.equal(refunded.paymentStatus, 'refunded');
  assert.deepEqual(succeeded.calls, [{
    method: 'refund',
    params: { payment_intent: 'pi_1' },
    options: { idempotencyKey: refundIdempotencyKey('svc-1') },
  }]);
  assert.equal(refundIdempotencyKey('svc-1'), refundIdempotencyKey('svc-1'));

  const authorized = fakeStripe('requires_capture');
  const canceled = await releaseCancelledPayment(authorized, {
    serviceId: 'svc-1',
    serviceStatus: 'cancelled',
    paymentIntentId: 'pi_1',
  });
  assert.equal(canceled.action, 'cancel');
  assert.equal(canceled.paymentStatus, 'canceled');
  assert.equal(authorized.calls[0].method, 'cancel');
  assert.equal(authorized.calls[0].options.idempotencyKey, cancelPaymentIntentIdempotencyKey('svc-1'));
  assert.equal(authorized.calls.some((call) => call.method === 'refund'), false);
});

test('client-marked paid is not enough, and a payout or foreign charge is not refunded', async () => {
  const confirmed = fakeStripe('succeeded');
  const notCancelled = await releaseCancelledPayment(confirmed, {
    serviceId: 'svc-1',
    serviceStatus: 'confirmed',
    paymentIntentId: 'pi_1',
  });
  assert.equal(notCancelled.reason, 'not_cancelled');
  assert.equal(confirmed.calls.length, 0);
  assert.equal(refundHttpResult(notCancelled).httpStatus, 200);
  assert.equal(refundHttpResult(notCancelled).writePaymentStatus, null);

  const paidUnassign = fakeStripe('succeeded');
  const unassigned = await releaseCancelledPayment(paidUnassign, {
    serviceId: 'svc-1',
    serviceStatus: 'finding_pros',
    paymentIntentId: 'pi_1',
  });
  assert.equal(unassigned.reason, 'not_cancelled');
  assert.equal(paidUnassign.calls.length, 0);

  const payout = fakeStripe('succeeded');
  const blocked = await releaseCancelledPayment(payout, {
    serviceId: 'svc-1',
    serviceStatus: 'cancelled',
    paymentIntentId: 'pi_1',
    payoutTransferId: 'tr_1',
  });
  assert.equal(blocked.reason, 'payout_exists');
  assert.equal(payout.calls.length, 0);
  assert.equal(refundBlockedByPayout('tr_1'), true);
  assert.equal(refundHttpResult(blocked).httpStatus, 409);

  const foreign = fakeStripe('succeeded', { metadata: { service_id: 'other-job' } });
  const mismatch = await releaseCancelledPayment(foreign, {
    serviceId: 'svc-1',
    serviceStatus: 'cancelled',
    paymentIntentId: 'pi_1',
  });
  assert.equal(mismatch.reason, 'metadata_mismatch');
  assert.equal(foreign.calls.length, 0);
});

test('an already refunded charge and a pending refund set payment_status without another product rule', async () => {
  const error = new Error('already refunded');
  error.code = 'charge_already_refunded';
  const already = fakeStripe('succeeded', { refundError: error });
  const result = await releaseCancelledPayment(already, {
    serviceId: 'svc-1',
    serviceStatus: 'cancelled',
    paymentIntentId: 'pi_1',
  });
  assert.equal(result.paymentStatus, 'refunded');

  const pending = fakeStripe('succeeded', { refundStatus: 'pending' });
  const waiting = await releaseCancelledPayment(pending, {
    serviceId: 'svc-1',
    serviceStatus: 'cancelled',
    paymentIntentId: 'pi_1',
  });
  assert.equal(waiting.paymentStatus, 'refund_pending');
  assert.equal(paymentStatusAfterRefundCreate('succeeded'), 'refunded');
  assert.equal(refundHttpResult(waiting).writePaymentStatus, 'refund_pending');

  const processing = fakeStripe('processing');
  const retry = await releaseCancelledPayment(processing, {
    serviceId: 'svc-1',
    serviceStatus: 'cancelled',
    paymentIntentId: 'pi_1',
  });
  assert.equal(retry.reason, 'unsupported');
  assert.equal(refundHttpResult(retry).httpStatus, 500);
});
