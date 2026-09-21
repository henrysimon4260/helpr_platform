import { isAlreadyRefunded, unclaimedPaymentRelease } from './autofillPayment.ts'
import { timingSafeEqualString } from './stripeWebhook.ts'

export function secretsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  if (!left || !right) return false
  return timingSafeEqualString(left, right)
}

export function readRefundServiceId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  const direct = nonEmptyString(record.service_id) ?? nonEmptyString(record.serviceId)
  if (direct) return direct
  const nested = record.record
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nonEmptyString((nested as Record<string, unknown>).service_id)
  }
  return null
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function authorizeRefundCaller(input: {
  isServiceRole: boolean
  signedIn: boolean
  ownsService: boolean
}): { ok: true; via: 'service_role' | 'customer' } | { ok: false; status: 401 | 403; error: string } {
  if (input.isServiceRole) return { ok: true, via: 'service_role' }
  if (!input.signedIn) {
    return { ok: false, status: 401, error: 'Sign in again before refunding this booking.' }
  }
  if (!input.ownsService) {
    return { ok: false, status: 403, error: 'You cannot refund this booking.' }
  }
  return { ok: true, via: 'customer' }
}

export function refundBlockedByPayout(transferId: string | null | undefined): boolean {
  return typeof transferId === 'string' && transferId.length > 0
}

export function refundIdempotencyKey(serviceId: string): string {
  return `helpr-cancel-refund-${serviceId}`
}

export function cancelPaymentIntentIdempotencyKey(serviceId: string): string {
  return `helpr-cancel-pi-${serviceId}`
}

export function paymentStatusAfterRefundCreate(
  status: string,
): 'refunded' | 'refund_pending' | null {
  if (status === 'succeeded') return 'refunded'
  if (status === 'pending' || status === 'requires_action') return 'refund_pending'
  return null
}

/**
 * Refund or cancel only when the job is already cancelled.
 * The Stripe PaymentIntent status picks the call. Client payment_status is not an input.
 * requires_capture is canceled, matching void-unclaimed-payment. This does not create
 * a new authorize-then-capture charge.
 */
export function cancelledPaymentRelease(input: {
  serviceStatus: string | null | undefined
  paymentIntentId: string | null | undefined
  stripeStatus: string
}):
  | { ok: true; action: 'refund' | 'cancel' | 'none' }
  | { ok: false; reason: 'not_cancelled' | 'missing_payment_intent' | 'unsupported' } {
  if ((input.serviceStatus ?? '').toLowerCase() !== 'cancelled') {
    return { ok: false, reason: 'not_cancelled' }
  }
  if (typeof input.paymentIntentId !== 'string' || input.paymentIntentId.length === 0) {
    return { ok: false, reason: 'missing_payment_intent' }
  }

  const action = unclaimedPaymentRelease(input.stripeStatus)
  if (action === 'unsupported') return { ok: false, reason: 'unsupported' }
  if (action === 'none') return { ok: true, action: 'none' }
  return { ok: true, action }
}

export type RefundStripe = {
  paymentIntents: {
    retrieve: (id: string) => Promise<{ id: string; status: string; metadata?: { service_id?: string | null } | null }>
    cancel: (
      id: string,
      params: Record<string, never>,
      options: { idempotencyKey: string },
    ) => Promise<{ status: string }>
  }
  refunds: {
    create: (
      params: { payment_intent: string },
      options: { idempotencyKey: string },
    ) => Promise<{ id: string; status: string }>
  }
}

export type ReleaseResult =
  | {
      ok: true
      action: 'refund' | 'cancel' | 'none'
      paymentStatus: 'refunded' | 'refund_pending' | 'canceled'
      stripeStatus: string
    }
  | {
      ok: false
      reason: 'not_cancelled' | 'missing_payment_intent' | 'metadata_mismatch' | 'unsupported' | 'payout_exists' | 'refund_failed'
      stripeStatus?: string
    }

export async function releaseCancelledPayment(
  stripe: RefundStripe,
  input: {
    serviceId: string
    serviceStatus: string | null | undefined
    paymentIntentId: string | null | undefined
    payoutTransferId?: string | null
  },
): Promise<ReleaseResult> {
  if (refundBlockedByPayout(input.payoutTransferId)) {
    return { ok: false, reason: 'payout_exists' }
  }
  if ((input.serviceStatus ?? '').toLowerCase() !== 'cancelled') {
    return { ok: false, reason: 'not_cancelled' }
  }
  if (typeof input.paymentIntentId !== 'string' || input.paymentIntentId.length === 0) {
    return { ok: false, reason: 'missing_payment_intent' }
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(input.paymentIntentId)
  const metadataServiceId = paymentIntent.metadata?.service_id
  if (metadataServiceId && metadataServiceId !== input.serviceId) {
    return { ok: false, reason: 'metadata_mismatch', stripeStatus: paymentIntent.status }
  }

  const release = cancelledPaymentRelease({
    serviceStatus: input.serviceStatus,
    paymentIntentId: input.paymentIntentId,
    stripeStatus: paymentIntent.status,
  })
  if (!release.ok) {
    return { ok: false, reason: release.reason, stripeStatus: paymentIntent.status }
  }

  if (release.action === 'none') {
    return { ok: true, action: 'none', paymentStatus: 'canceled', stripeStatus: paymentIntent.status }
  }

  if (release.action === 'cancel') {
    await stripe.paymentIntents.cancel(input.paymentIntentId, {}, {
      idempotencyKey: cancelPaymentIntentIdempotencyKey(input.serviceId),
    })
    return { ok: true, action: 'cancel', paymentStatus: 'canceled', stripeStatus: paymentIntent.status }
  }

  try {
    const refund = await stripe.refunds.create(
      { payment_intent: input.paymentIntentId },
      { idempotencyKey: refundIdempotencyKey(input.serviceId) },
    )
    const paymentStatus = paymentStatusAfterRefundCreate(refund.status)
    if (!paymentStatus) {
      return { ok: false, reason: 'refund_failed', stripeStatus: paymentIntent.status }
    }
    return { ok: true, action: 'refund', paymentStatus, stripeStatus: paymentIntent.status }
  } catch (error) {
    if (isAlreadyRefunded(error)) {
      return { ok: true, action: 'refund', paymentStatus: 'refunded', stripeStatus: paymentIntent.status }
    }
    throw error
  }
}

export function refundHttpResult(result: ReleaseResult): {
  httpStatus: number
  body: Record<string, unknown>
  writePaymentStatus: 'refunded' | 'refund_pending' | 'canceled' | null
} {
  if (result.ok) {
    return {
      httpStatus: 200,
      body: {
        released: true,
        action: result.action,
        payment_status: result.paymentStatus,
      },
      writePaymentStatus: result.paymentStatus,
    }
  }

  if (result.reason === 'not_cancelled') {
    return { httpStatus: 200, body: { released: false, skipped: 'not_cancelled' }, writePaymentStatus: null }
  }
  if (result.reason === 'missing_payment_intent') {
    return { httpStatus: 200, body: { released: false, skipped: 'no_payment' }, writePaymentStatus: null }
  }
  if (result.reason === 'metadata_mismatch') {
    return {
      httpStatus: 400,
      body: { released: false, error: 'This charge does not belong to this job.' },
      writePaymentStatus: null,
    }
  }
  if (result.reason === 'payout_exists') {
    return {
      httpStatus: 409,
      body: { released: false, error: 'Payout already sent for this job.' },
      writePaymentStatus: null,
    }
  }
  if (result.reason === 'unsupported' && result.stripeStatus === 'processing') {
    return {
      httpStatus: 500,
      body: { released: false, error: 'Payment is still processing.' },
      writePaymentStatus: null,
    }
  }
  if (result.reason === 'unsupported') {
    return { httpStatus: 200, body: { released: false, skipped: 'unsupported' }, writePaymentStatus: null }
  }

  return {
    httpStatus: 500,
    body: { released: false, error: 'The refund did not succeed.' },
    writePaymentStatus: null,
  }
}
