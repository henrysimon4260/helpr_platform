import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  anonymizedEmail,
  findJobBlockers,
  hasOutstandingProviderBalance,
  isOpenServiceDeletable,
  mergeServices,
  shouldSoftDeleteProfile,
  stripeBalanceIsOutstanding,
} from './policy.ts'

test('live jobs block deletion and are not treated as open requests', () => {
  for (const status of ['confirmed', 'helpr_otw', 'in_progress']) {
    const blocker = findJobBlockers([{ service_id: 'job-1', status, payment_intent_id: 'pi_123', payment_status: 'paid' }])
    assert.equal(blocker?.code, 'open_jobs')
    assert.equal(isOpenServiceDeletable({ service_id: 'job-1', status }), false)
  }
})

test('open requests with no payment signal can be deleted', () => {
  for (const status of ['finding_pros', 'pending', 'scheduled', 'select_service_provider']) {
    const service = { service_id: 'job-1', status, payment_intent_id: null, payment_status: null }
    assert.equal(findJobBlockers([service]), null)
    assert.equal(isOpenServiceDeletable(service), true)
  }
})

test('a payment intent or paid status on a non-completed job blocks deletion', () => {
  const withIntent = findJobBlockers([
    { service_id: 'job-1', status: 'finding_pros', payment_intent_id: 'pi_123', payment_status: null },
  ])
  assert.equal(withIntent?.code, 'unpaid_obligation')
  assert.equal(
    isOpenServiceDeletable({ service_id: 'job-1', status: 'finding_pros', payment_intent_id: 'pi_123' }),
    false,
  )

  const markedPaid = findJobBlockers([
    { service_id: 'job-2', status: 'select_service_provider', payment_status: 'paid' },
  ])
  assert.equal(markedPaid?.code, 'unpaid_obligation')
})

test('completed jobs do not block, and unknown statuses do', () => {
  assert.equal(findJobBlockers([{ service_id: 'job-1', status: 'completed', payment_status: 'paid' }]), null)
  assert.equal(findJobBlockers([{ service_id: 'job-2', status: 'cancelled' }])?.code, 'unresolved_job')
  assert.equal(findJobBlockers([{ service_id: 'job-3', status: null }])?.code, 'unresolved_job')
})

test('provider balance and Stripe balance fail closed on any remainder', () => {
  assert.equal(hasOutstandingProviderBalance(null), false)
  assert.equal(hasOutstandingProviderBalance(0), false)
  assert.equal(hasOutstandingProviderBalance(0.01), true)
  assert.equal(hasOutstandingProviderBalance(Number.NaN), true)
  assert.equal(stripeBalanceIsOutstanding([{ amount: 0 }], [{ amount: 0 }]), false)
  assert.equal(stripeBalanceIsOutstanding([{ amount: 0 }], [{ amount: 50 }]), true)
  assert.equal(stripeBalanceIsOutstanding([{ amount: -1 }], []), true)
})

test('profiles with completed work or ledger rows are soft-deleted', () => {
  assert.equal(shouldSoftDeleteProfile([], 0), false)
  assert.equal(shouldSoftDeleteProfile([{ service_id: 'job-1', status: 'completed' }], 0), true)
  assert.equal(shouldSoftDeleteProfile([{ service_id: 'job-1', status: 'finding_pros' }], 1), true)
  assert.equal(anonymizedEmail('abc-123'), 'deleted+abc123@users.invalid')
})

test('mergeServices keeps one row per service id', () => {
  const merged = mergeServices([
    [{ service_id: 'job-1', status: 'finding_pros' }],
    [{ service_id: 'job-1', status: 'finding_pros' }, { service_id: 'job-2', status: 'completed' }],
  ])
  assert.deepEqual(merged.map((service) => service.service_id).sort(), ['job-1', 'job-2'])
})
