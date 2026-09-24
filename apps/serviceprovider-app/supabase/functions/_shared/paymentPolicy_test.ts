import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  bearerToken,
  cardDeleteDecision,
  decidePayout,
  dollarsToCents,
  ledgerAfterPayout,
  paymentIntentBlocksDetach,
} from './paymentPolicy.ts'

test('allows deleting a card when no paid job is in flight', () => {
  const decision = cardDeleteDecision({
    savedCardCount: 1,
    inFlightPaidJobCount: 0,
    paymentIntentStatus: 'succeeded',
  })
  assert.equal(decision.allowed, true)
})

test('blocks deleting the only card on an in-flight paid job', () => {
  const decision = cardDeleteDecision({
    savedCardCount: 1,
    inFlightPaidJobCount: 1,
    paymentIntentStatus: 'succeeded',
  })
  assert.equal(decision.allowed, false)
  if (!decision.allowed) {
    assert.equal(decision.code, 'only_card_in_flight')
  }
})

test('allows deleting one of several cards during an in-flight paid job', () => {
  const decision = cardDeleteDecision({
    savedCardCount: 2,
    inFlightPaidJobCount: 1,
    paymentIntentStatus: null,
  })
  assert.equal(decision.allowed, true)
})

test('blocks detach while the payment intent still needs this card', () => {
  assert.equal(paymentIntentBlocksDetach('requires_capture'), true)
  assert.equal(paymentIntentBlocksDetach('processing'), true)
  assert.equal(paymentIntentBlocksDetach('succeeded'), false)
  assert.equal(paymentIntentBlocksDetach(null), false)

  const decision = cardDeleteDecision({
    savedCardCount: 3,
    inFlightPaidJobCount: 1,
    paymentIntentStatus: 'requires_capture',
  })
  assert.equal(decision.allowed, false)
  if (!decision.allowed) {
    assert.equal(decision.code, 'payment_in_progress')
  }
})

test('pays out the card source balance without taking a fee', () => {
  const decision = decidePayout({
    requestedCents: null,
    availableCardCents: 2500,
    availableBankCents: 0,
    pendingCents: 100,
  })
  assert.deepEqual(decision, { ok: true, amountCents: 2500, sourceType: 'card' })
})

test('refuses a withdraw while funds are only pending', () => {
  const decision = decidePayout({
    requestedCents: null,
    availableCardCents: 0,
    availableBankCents: 0,
    pendingCents: 4000,
  })
  assert.equal(decision.ok, false)
  if (!decision.ok) {
    assert.equal(decision.code, 'funds_pending')
  }
})

test('refuses a withdraw above the available balance', () => {
  const decision = decidePayout({
    requestedCents: 5000,
    availableCardCents: 1000,
    availableBankCents: 0,
    pendingCents: 0,
  })
  assert.equal(decision.ok, false)
  if (!decision.ok) {
    assert.equal(decision.code, 'amount_invalid')
  }
})

test('prefers the card source when both balances are available', () => {
  const decision = decidePayout({
    requestedCents: null,
    availableCardCents: 1000,
    availableBankCents: 5000,
    pendingCents: 0,
  })
  assert.deepEqual(decision, { ok: true, amountCents: 1000, sourceType: 'card' })
})

test('uses the bank source when that is the only available balance', () => {
  const decision = decidePayout({
    requestedCents: null,
    availableCardCents: 0,
    availableBankCents: 800,
    pendingCents: 0,
  })
  assert.deepEqual(decision, { ok: true, amountCents: 800, sourceType: 'bank_account' })
})

test('ledger drops by the payout amount and does not go negative', () => {
  assert.equal(dollarsToCents('12.34'), 1234)
  assert.equal(ledgerAfterPayout(10000, 4000), 60)
  assert.equal(ledgerAfterPayout(100, 400), 0)
})

test('reads a bearer token and rejects a missing header', () => {
  assert.equal(bearerToken('Bearer abc.def.ghi'), 'abc.def.ghi')
  assert.equal(bearerToken('bearer token-1'), 'token-1')
  assert.equal(bearerToken(null), null)
  assert.equal(bearerToken('Basic abc'), null)
})
