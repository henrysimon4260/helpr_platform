import assert from 'node:assert/strict';
import test from 'node:test';
import { checkrGoLiveCopy, isCheckrClear, isUsStateCode, normalizeCheckrStatus } from './checkrStatus.ts';

const day = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-09-24T12:00:00.000Z');

test('only clear unlocks go-live', () => {
  assert.equal(isCheckrClear('clear'), true);
  assert.equal(isCheckrClear('CLEAR'), true);
  assert.equal(isCheckrClear('consider'), false);
  assert.equal(isCheckrClear('pending'), false);
  assert.equal(isCheckrClear(null), false);
  assert.equal(normalizeCheckrStatus('on_the_way'), 'not_started');
});

test('consider and suspended have no self-serve restart', () => {
  const consider = checkrGoLiveCopy({ status: 'consider', now });
  const suspended = checkrGoLiveCopy({ status: 'suspended', now });
  assert.equal(consider.action, 'none');
  assert.match(consider.message, /consider/);
  assert.equal(suspended.action, 'none');
  assert.match(suspended.message, /suspended/);
});

test('expired and stuck pending checks tell the provider to start over', () => {
  const expired = checkrGoLiveCopy({
    status: 'pending',
    invitationExpiresAt: '2026-09-20T12:00:00.000Z',
    hasInvitationUrl: true,
    now,
  });
  assert.equal(expired.action, 'restart');
  assert.match(expired.title, /expired/i);

  const stuck = checkrGoLiveCopy({
    status: 'pending',
    statusUpdatedAt: new Date(now - 9 * day).toISOString(),
    hasInvitationUrl: true,
    now,
  });
  assert.equal(stuck.action, 'restart');
  assert.match(stuck.title, /stuck/i);
});

test('an active invitation can be continued', () => {
  const pending = checkrGoLiveCopy({
    status: 'pending',
    invitationExpiresAt: '2026-09-28T12:00:00.000Z',
    statusUpdatedAt: new Date(now - day).toISOString(),
    hasInvitationUrl: true,
    now,
  });
  assert.equal(pending.action, 'continue');
});

test('a missing Checkr read fails closed', () => {
  const copy = checkrGoLiveCopy({ status: 'clear', loadError: true, now });
  assert.equal(copy.action, 'none');
  assert.match(copy.message, /stay locked/);
});

test('work state must be a US postal code', () => {
  assert.equal(isUsStateCode('ca'), true);
  assert.equal(isUsStateCode('California'), false);
  assert.equal(isUsStateCode('XX'), false);
});
