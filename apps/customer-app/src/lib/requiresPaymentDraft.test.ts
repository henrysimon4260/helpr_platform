import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PAYMENT_STATUS_PAID,
  PAYMENT_STATUS_REQUIRES_PAYMENT,
  applyRequiresPaymentToDraft,
  resolveConfirmAction,
  resolveSchedulerPaymentGate,
} from './requiresPaymentDraft.ts';

const movingDraft = {
  service_id: 'svc-1',
  customer_id: 'cus-1',
  date_of_creation: '2026-09-24T00:00:00.000Z',
  service_type: 'Moving',
  status: 'finding_pros',
  start_location: '1 Main St',
  end_location: '2 Main St',
  price: 120,
  payment_method_type: 'Personal',
  autofill_type: 'Custom',
  description: 'Two-bedroom move',
};

describe('requiresPayment draft flag', () => {
  it('treats an explicit true flag as payment-required and persists it', () => {
    const original = { ...movingDraft, requiresPayment: 'true' };

    assert.equal(resolveSchedulerPaymentGate(original, 'true'), 'payment_required');
    assert.equal(resolveConfirmAction(original, 'free'), 'payment');

    const row = applyRequiresPaymentToDraft(original, 'true');

    assert.equal(row.payment_status, PAYMENT_STATUS_REQUIRES_PAYMENT);
    assert.equal(row.status, 'finding_pros');
    assert.equal(row.price, 120);
    assert.equal('requiresPayment' in row, false);
    assert.equal('requires_payment' in row, false);
    assert.equal(original.requiresPayment, 'true');
  });

  it('reads a stored payment_status when the route flag is gone', () => {
    const stored = { ...movingDraft, payment_status: PAYMENT_STATUS_REQUIRES_PAYMENT };

    assert.equal(resolveSchedulerPaymentGate(stored), 'payment_required');
    assert.equal(resolveConfirmAction(stored, 'free'), 'payment');
  });

  it('keeps prior open-job behavior when the flag is unset', () => {
    const row = applyRequiresPaymentToDraft({ ...movingDraft }, undefined);

    assert.equal(resolveSchedulerPaymentGate(movingDraft, undefined), 'open');
    assert.equal(resolveConfirmAction(movingDraft, 'free'), 'free');
    assert.equal(resolveConfirmAction(movingDraft, 'payment'), 'payment');
    assert.deepEqual(row, movingDraft);
    assert.equal('payment_status' in row, false);
  });

  it('keeps prior open-job behavior when the flag is false', () => {
    const draft = {
      ...movingDraft,
      requiresPayment: 'false',
      payment_status: PAYMENT_STATUS_REQUIRES_PAYMENT,
    };

    assert.equal(resolveSchedulerPaymentGate(draft, 'false'), 'open');
    assert.equal(resolveSchedulerPaymentGate(draft, false), 'open');
    assert.equal(resolveConfirmAction({ requiresPayment: false }, 'free'), 'free');

    const row = applyRequiresPaymentToDraft(draft, 'false');
    assert.equal('payment_status' in row, false);
    assert.equal('requiresPayment' in row, false);
    assert.equal(row.status, 'finding_pros');
  });

  it('does not downgrade an already paid service row', () => {
    const paid = { ...movingDraft, payment_status: PAYMENT_STATUS_PAID };
    const row = applyRequiresPaymentToDraft(paid, 'true');

    assert.equal(row.payment_status, PAYMENT_STATUS_PAID);
    assert.equal(resolveConfirmAction(paid, 'free'), 'free');
  });
});
