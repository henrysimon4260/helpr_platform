import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyPreservedSchedulingType,
  preservedSchedulingType,
  schedulingPatchForAutoFillClaim,
} from './autofillScheduling.ts';

test('keeps ASAP and scheduled spellings', () => {
  assert.equal(preservedSchedulingType('asap'), 'asap');
  assert.equal(preservedSchedulingType('ASAP'), 'ASAP');
  assert.equal(preservedSchedulingType(' scheduled '), 'scheduled');
});

test('omits a missing scheduling type', () => {
  assert.equal(preservedSchedulingType(null), undefined);
  assert.equal(preservedSchedulingType(undefined), undefined);
  assert.equal(preservedSchedulingType('   '), undefined);
  assert.deepEqual(schedulingPatchForAutoFillClaim(null), {});
  assert.deepEqual(schedulingPatchForAutoFillClaim('asap'), { scheduling_type: 'asap' });
});

test('ASAP claim does not rewrite scheduling_type to scheduled', () => {
  const update = applyPreservedSchedulingType(
    {
      service_provider_id: 'provider-1',
      status: 'confirmed',
      price: 80,
      scheduling_type: 'scheduled',
      scheduled_date_time: '2026-09-22T15:00:00.000Z',
      payment_status: 'paid',
      payment_intent_id: 'pi_autofill',
    },
    'asap',
  );

  assert.equal(update.scheduling_type, 'asap');
  assert.equal(update.payment_intent_id, 'pi_autofill');
  assert.equal(update.payment_status, 'paid');
  assert.equal(update.status, 'confirmed');
  assert.equal(update.scheduled_date_time, '2026-09-22T15:00:00.000Z');
});

test('scheduled jobs stay scheduled and charge fields stay on the write', () => {
  const update = applyPreservedSchedulingType(
    {
      service_provider_id: 'provider-1',
      status: 'confirmed',
      price: 80,
      scheduled_date_time: '2026-09-22T15:00:00.000Z',
      payment_status: 'paid',
      payment_intent_id: 'pi_scheduled',
    },
    'scheduled',
  );

  assert.deepEqual(update, {
    service_provider_id: 'provider-1',
    status: 'confirmed',
    price: 80,
    scheduled_date_time: '2026-09-22T15:00:00.000Z',
    payment_status: 'paid',
    payment_intent_id: 'pi_scheduled',
    scheduling_type: 'scheduled',
  });
});

test('does not invent scheduled when the job has no scheduling type', () => {
  const update = applyPreservedSchedulingType(
    {
      service_provider_id: 'provider-1',
      status: 'confirmed',
      price: 40,
      scheduling_type: 'scheduled',
      scheduled_date_time: null,
    },
    null,
  );

  assert.equal('scheduling_type' in update, false);
  assert.equal(update.status, 'confirmed');
  assert.equal(update.price, 40);
});
