import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  OPEN_UNASSIGNED_STATUSES,
  confirmAssignmentOutcome,
  isOpenUnassignedJob,
  lostConfirmShouldReleaseCharge,
} from './confirmOpenJob.ts';

test('open unassigned statuses are the pre-assignment spellings', () => {
  assert.deepEqual(OPEN_UNASSIGNED_STATUSES, [
    'finding_pros',
    'pending',
    'scheduled',
    'select_service_provider',
  ]);
});

test('a job is open only when unassigned and still pre-assignment', () => {
  assert.equal(isOpenUnassignedJob({ status: 'finding_pros', service_provider_id: null }), true);
  assert.equal(isOpenUnassignedJob({ status: 'select_service_provider', service_provider_id: null }), true);
  assert.equal(isOpenUnassignedJob({ status: 'pending', service_provider_id: null }), true);
  assert.equal(isOpenUnassignedJob({ status: 'scheduled', service_provider_id: null }), true);
  assert.equal(isOpenUnassignedJob({ status: 'finding_pros', service_provider_id: 'pro_autofill' }), false);
  assert.equal(isOpenUnassignedJob({ status: 'confirmed', service_provider_id: null }), false);
  assert.equal(isOpenUnassignedJob({ status: 'helpr_otw', service_provider_id: null }), false);
  assert.equal(isOpenUnassignedJob(null), false);
});

test('a matching conditional update wins', () => {
  assert.equal(confirmAssignmentOutcome({
    updatedCount: 1,
    selectedProviderId: 'pro_selected',
    paymentIntentId: 'pi_customer',
    service: { status: 'finding_pros', service_provider_id: null },
  }), 'won');
});

test('a retry of our own confirm wins without writing again', () => {
  assert.equal(confirmAssignmentOutcome({
    updatedCount: 0,
    selectedProviderId: 'pro_selected',
    paymentIntentId: 'pi_customer',
    service: {
      status: 'confirmed',
      service_provider_id: 'pro_selected',
      payment_intent_id: 'pi_customer',
    },
  }), 'won');
});

test('an unpaid select of the same already-confirmed pro is our win', () => {
  assert.equal(confirmAssignmentOutcome({
    updatedCount: 0,
    selectedProviderId: 'pro_selected',
    paymentIntentId: null,
    service: {
      status: 'confirmed',
      service_provider_id: 'pro_selected',
      payment_intent_id: 'pi_autofill',
    },
  }), 'won');
});

test('a late confirm loses to an AutoFill assignment and must not overwrite it', () => {
  assert.equal(confirmAssignmentOutcome({
    updatedCount: 0,
    selectedProviderId: 'pro_selected',
    paymentIntentId: 'pi_customer',
    service: {
      status: 'confirmed',
      service_provider_id: 'pro_autofill',
      payment_intent_id: 'pi_autofill',
    },
  }), 'lost');
});

test('same provider with a different PaymentIntent is a lost race, not a second confirm', () => {
  assert.equal(confirmAssignmentOutcome({
    updatedCount: 0,
    selectedProviderId: 'pro_selected',
    paymentIntentId: 'pi_customer',
    service: {
      status: 'confirmed',
      service_provider_id: 'pro_selected',
      payment_intent_id: 'pi_autofill',
    },
  }), 'lost');
});

test('zero rows on a still-open job is unchanged so the charge is kept for retry', () => {
  assert.equal(confirmAssignmentOutcome({
    updatedCount: 0,
    selectedProviderId: 'pro_selected',
    paymentIntentId: 'pi_customer',
    service: {
      status: 'select_service_provider',
      service_provider_id: null,
      payment_intent_id: 'pi_customer',
    },
  }), 'unchanged');
});

test('a missing service row is a lost confirm', () => {
  assert.equal(confirmAssignmentOutcome({
    updatedCount: 0,
    selectedProviderId: 'pro_selected',
    paymentIntentId: 'pi_customer',
    service: null,
  }), 'lost');
});

test('select-helpr confirm is a conditional update and voids a lost charge', () => {
  const source = readFileSync(new URL('./select-helpr.tsx', import.meta.url), 'utf8');
  assert.match(source, /\.in\('status', \[\.\.\.OPEN_UNASSIGNED_STATUSES\]\)/);
  assert.match(source, /\.is\('service_provider_id', null\)/);
  assert.match(source, /void-unclaimed-payment/);
  assert.match(source, /payment_intent_id: paymentIntentId/);
  assert.doesNotMatch(source, /\.update\(updateData\)\s*\.eq\('service_id', serviceId\);/);
});

test('lost confirm releases an orphaned charge and keeps the winner payment', () => {
  assert.equal(lostConfirmShouldReleaseCharge({
    status: 'confirmed',
    service_provider_id: 'pro_autofill',
    payment_intent_id: 'pi_autofill',
  }, 'pi_customer'), true);

  assert.equal(lostConfirmShouldReleaseCharge({
    status: 'confirmed',
    service_provider_id: 'pro_autofill',
    payment_intent_id: 'pi_customer',
  }, 'pi_customer'), false);

  assert.equal(lostConfirmShouldReleaseCharge({
    status: 'helpr_otw',
    payment_intent_id: 'pi_customer',
  }, 'pi_customer'), false);

  assert.equal(lostConfirmShouldReleaseCharge(null, 'pi_customer'), true);
  assert.equal(lostConfirmShouldReleaseCharge({ status: 'confirmed', payment_intent_id: 'pi_autofill' }, null), false);
});
