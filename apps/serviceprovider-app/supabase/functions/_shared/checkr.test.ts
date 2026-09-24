import assert from 'node:assert/strict';
import test from 'node:test';
import { checkrSignatureMatches, hmacSha256Hex, reduceCheckrEvent } from './checkr.ts';

test('a clear report unlocks and a consider report does not', () => {
  const cleared = reduceCheckrEvent('pending', 'report.completed', {
    id: 'report_1',
    object: 'report',
    status: 'complete',
    result: 'clear',
    candidate_id: 'cand_1',
  });
  assert.equal(cleared.status, 'clear');
  assert.equal(cleared.changed, true);
  assert.equal(cleared.reportId, 'report_1');

  const consider = reduceCheckrEvent('pending', 'report.completed', {
    id: 'report_2',
    object: 'report',
    status: 'complete',
    result: 'consider',
    candidate_id: 'cand_1',
  });
  assert.equal(consider.status, 'consider');

  const missingResult = reduceCheckrEvent('pending', 'report.completed', {
    id: 'report_3',
    object: 'report',
    status: 'complete',
    result: null,
    candidate_id: 'cand_1',
  });
  assert.equal(missingResult.status, 'consider');
});

test('review and escalated assessments fail closed even when result is clear', () => {
  const review = reduceCheckrEvent('pending', 'report.completed', {
    object: 'report',
    status: 'complete',
    result: 'clear',
    assessment: 'review',
  });
  assert.equal(review.status, 'consider');
});

test('report.engaged does not turn consider into clear', () => {
  const engaged = reduceCheckrEvent('consider', 'report.engaged', {
    id: 'report_2',
    object: 'report',
    status: 'complete',
    result: 'consider',
  });
  assert.equal(engaged.status, 'consider');
  assert.equal(engaged.changed, false);
});

test('late invitation events do not wipe a clear result', () => {
  const expired = reduceCheckrEvent('clear', 'invitation.expired', {
    id: 'inv_1',
    object: 'invitation',
    candidate_id: 'cand_1',
  });
  assert.equal(expired.status, 'clear');
  assert.equal(expired.invitationId, 'inv_1');
});

test('suspension blocks, and resume returns to pending', () => {
  const suspended = reduceCheckrEvent('pending', 'report.suspended', {
    id: 'report_4',
    object: 'report',
    status: 'suspended',
    candidate_id: 'cand_1',
  });
  assert.equal(suspended.status, 'suspended');

  const resumed = reduceCheckrEvent('suspended', 'report.resumed', {
    id: 'report_4',
    object: 'report',
    status: 'pending',
    candidate_id: 'cand_1',
  });
  assert.equal(resumed.status, 'pending');
});

test('webhook signature matches the raw body and rejects a mismatch', async () => {
  const secret = 'test-checkr-secret';
  const body = JSON.stringify({ type: 'report.completed', data: { object: { result: 'clear' } } });
  const digest = await hmacSha256Hex(secret, body);
  assert.equal(await checkrSignatureMatches(secret, body, digest), true);
  assert.equal(await checkrSignatureMatches(secret, body, `t=1700000000,v1=${digest}`), true);
  const flipped = `${digest.startsWith('0') ? '1' : '0'}${digest.slice(1)}`;
  assert.equal(await checkrSignatureMatches(secret, body, flipped), false);
  assert.equal(await checkrSignatureMatches('', body, digest), false);
  assert.equal(
    await checkrSignatureMatches(secret, body, 'Please create an API key to check the authenticity of our webhooks.'),
    false,
  );
});
