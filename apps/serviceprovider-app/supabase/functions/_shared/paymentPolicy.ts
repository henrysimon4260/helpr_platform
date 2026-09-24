/** In-flight jobs that already have a customer payment. Spellings match JOB_CONTRACT.md. */
export const IN_FLIGHT_PAID_STATUSES = ['confirmed', 'helpr_otw', 'in_progress'] as const

export type CardDeleteDecision =
  | { allowed: true }
  | { allowed: false; code: 'payment_in_progress' | 'only_card_in_flight'; error: string }

/**
 * Refuse a detach when Stripe still needs this PaymentMethod, or when it is the
 * only saved card on a paid job that has not finished.
 * There is no database constraint for the only-card case; the edge function enforces it.
 */
export function cardDeleteDecision(input: {
  savedCardCount: number
  inFlightPaidJobCount: number
  paymentIntentStatus: string | null
}): CardDeleteDecision {
  if (paymentIntentBlocksDetach(input.paymentIntentStatus)) {
    return {
      allowed: false,
      code: 'payment_in_progress',
      error:
        'This card is attached to a payment that has not finished processing. It was not removed.',
    }
  }

  if (input.savedCardCount <= 1 && input.inFlightPaidJobCount > 0) {
    return {
      allowed: false,
      code: 'only_card_in_flight',
      error:
        'This is your only saved card, and you have a paid job still in progress. Add another card before removing this one.',
    }
  }

  return { allowed: true }
}

/** Statuses where complete-service may still capture or confirm this PaymentMethod. */
export function paymentIntentBlocksDetach(status: string | null): boolean {
  if (!status) return false
  return (
    status === 'requires_capture' ||
    status === 'requires_confirmation' ||
    status === 'requires_action' ||
    status === 'processing'
  )
}

export type PayoutSourceType = 'card' | 'bank_account'

export type PayoutDecision =
  | { ok: true; amountCents: number; sourceType: PayoutSourceType }
  | {
      ok: false
      code: 'nothing_available' | 'funds_pending' | 'amount_invalid'
      error: string
    }

/**
 * Pay out Stripe Connect available balance only. No platform fee is applied here.
 * When both card and bank source balances are positive, pay the card balance
 * (Connect transfers from this platform land as card). A later withdraw can take the rest.
 */
export function decidePayout(input: {
  requestedCents: number | null
  availableCardCents: number
  availableBankCents: number
  pendingCents: number
}): PayoutDecision {
  const card = Math.max(0, Math.trunc(input.availableCardCents))
  const bank = Math.max(0, Math.trunc(input.availableBankCents))
  const pending = Math.max(0, Math.trunc(input.pendingCents))
  const sourceType: PayoutSourceType = card > 0 ? 'card' : 'bank_account'
  const sourceAvailable = sourceType === 'card' ? card : bank

  if (sourceAvailable <= 0) {
    if (pending > 0 || card + bank > 0) {
      return {
        ok: false,
        code: 'funds_pending',
        error: 'Funds are still settling in Stripe and are not available to pay out yet.',
      }
    }
    return {
      ok: false,
      code: 'nothing_available',
      error: 'There is no available balance to withdraw.',
    }
  }

  let amount = sourceAvailable
  if (input.requestedCents != null) {
    if (!Number.isInteger(input.requestedCents) || input.requestedCents <= 0) {
      return {
        ok: false,
        code: 'amount_invalid',
        error: 'Amount must be a positive number of cents.',
      }
    }
    if (input.requestedCents > sourceAvailable) {
      return {
        ok: false,
        code: 'amount_invalid',
        error: 'Amount is higher than the available balance.',
      }
    }
    amount = input.requestedCents
  }

  return { ok: true, amountCents: amount, sourceType }
}

export function dollarsToCents(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount * 100)
}

/** Ledger after a successful payout. Never goes below zero. Does not add a fee. */
export function ledgerAfterPayout(ledgerCents: number, paidCents: number): number {
  const nextCents = Math.max(0, Math.round(ledgerCents) - Math.round(paidCents))
  return nextCents / 100
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match?.[1] ?? null
}
