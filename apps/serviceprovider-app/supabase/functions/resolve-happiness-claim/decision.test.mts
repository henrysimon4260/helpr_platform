import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELPR_HAPPINESS_CAP_CENTS, planHappinessResolution } from './decision.ts';

const here = dirname(fileURLToPath(import.meta.url));

test('cap is $1,000', () => {
  assert.equal(HELPR_HAPPINESS_CAP_CENTS, 100_000);
});

test('approve pays the requested amount and records a manual payout', () => {
  const plan = planHappinessResolution(
    { status: 'submitted', amountRequestedCents: 18_000 },
    { decision: 'approve', payoutMethod: 'manual', notes: 'Goodwill for the broken lamp.' },
  );
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.nextStatus, 'paid');
  assert.equal(plan.outcome, 'approved');
  assert.equal(plan.amountApprovedCents, 18_000);
  assert.equal(plan.payoutMethod, 'manual');
  assert.equal(plan.stripeRefundCents, null);
});

test('approve at the cap stays approved', () => {
  const plan = planHappinessResolution(
    { status: 'needs_info', amountRequestedCents: HELPR_HAPPINESS_CAP_CENTS },
    { decision: 'approve', payoutMethod: 'manual', notes: 'Paying the program maximum.' },
  );
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.outcome, 'approved');
  assert.equal(plan.amountApprovedCents, 100_000);
});

test('a request above the cap cannot be resolved as filed', () => {
  const plan = planHappinessResolution(
    { status: 'submitted', amountRequestedCents: 150_000 },
    { decision: 'approve', payoutMethod: 'manual', notes: 'This should not be stored.' },
  );
  assert.equal(plan.ok, false);
});

test('partial must be less than the request', () => {
  const same = planHappinessResolution(
    { status: 'submitted', amountRequestedCents: 40_000 },
    {
      decision: 'partial',
      amountApprovedCents: 40_000,
      payoutMethod: 'manual',
      notes: 'This is the full request.',
    },
  );
  assert.equal(same.ok, false);

  const lower = planHappinessResolution(
    { status: 'submitted', amountRequestedCents: 40_000 },
    {
      decision: 'partial',
      amountApprovedCents: 12_500,
      payoutMethod: 'stripe_refund',
      notes: 'Paying the repair quote only.',
      refundableCents: 20_000,
    },
  );
  assert.equal(lower.ok, true);
  if (!lower.ok) return;
  assert.equal(lower.outcome, 'partial');
  assert.equal(lower.stripeRefundCents, 12_500);
});

test('stripe refund cannot exceed the refundable charge', () => {
  const plan = planHappinessResolution(
    { status: 'submitted', amountRequestedCents: 50_000 },
    {
      decision: 'approve',
      payoutMethod: 'stripe_refund',
      notes: 'Trying to refund more than the charge.',
      refundableCents: 8_000,
    },
  );
  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.match(plan.error, /manual payout/i);
});

test('deny and needs_info do not pay', () => {
  const denied = planHappinessResolution(
    { status: 'submitted', amountRequestedCents: 10_000 },
    { decision: 'deny', notes: 'The loss is ordinary wear from the booked work.' },
  );
  assert.equal(denied.ok, true);
  if (!denied.ok) return;
  assert.equal(denied.nextStatus, 'denied');
  assert.equal(denied.payoutMethod, null);

  const more = planHappinessResolution(
    { status: 'submitted', amountRequestedCents: 10_000 },
    { decision: 'needs_info', notes: 'Please send a photo of the damage.' },
  );
  assert.equal(more.ok, true);
  if (!more.ok) return;
  assert.equal(more.nextStatus, 'needs_info');
  assert.equal(more.amountApprovedCents, null);
});

test('resolved requests stay resolved', () => {
  const plan = planHappinessResolution(
    { status: 'paid', amountRequestedCents: 10_000 },
    { decision: 'deny', notes: 'Trying to decide again later.' },
  );
  assert.equal(plan.ok, false);
});

test('notes are required', () => {
  const plan = planHappinessResolution(
    { status: 'submitted', amountRequestedCents: 10_000 },
    { decision: 'deny', notes: 'no' },
  );
  assert.equal(plan.ok, false);
});

test('migration, contract, and function share the cap and window', () => {
  const migration = readFileSync(
    join(here, '../../migrations/20260927130000_helpr_happiness_claims.sql'),
    'utf8',
  );
  const contract = readFileSync(join(here, '../../../../../JOB_CONTRACT.md'), 'utf8');
  const customerPolicy = readFileSync(
    join(here, '../../../../../apps/customer-app/src/lib/helprHappiness/policy.ts'),
    'utf8',
  );
  for (const source of [migration, contract, customerPolicy]) {
    assert.match(source, /100000|100_000/);
    assert.match(source, /30/);
    assert.match(source, /not insurance/i);
  }
  assert.match(migration, /interval '30 days'/);
  assert.match(migration, /happiness-claim-evidence/);
  assert.doesNotMatch(migration, /\binsured\b/i);
});
