/**
 * Stripe webhook signature check and payment_status transitions.
 * Signature steps match Stripe's manual verification: v1 HMAC-SHA256 over
 * `${timestamp}.${rawBody}`, constant-time compare, 5 minute tolerance.
 * A tolerance of 0 disables the recency check (Stripe's rule). The handler
 * always passes 300.
 */

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300
export const WEBHOOK_CLAIM_STALE_MS = 60_000

const PAID_BLOCKERS = new Set([
  'refunded',
  'partially_refunded',
  'disputed',
  'dispute_lost',
])

const FAILED_ALLOWED = new Set(['', 'failed', 'pending'])

export type WebhookClaimAction = 'insert' | 'duplicate' | 'retry_later' | 'takeover'

export function timingSafeEqualString(left: string, right: string): boolean {
  const encoder = new TextEncoder()
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  const length = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

export function parseStripeSignatureHeader(
  header: string | null | undefined,
): { timestamp: string; signatures: string[] } | null {
  if (typeof header !== 'string' || header.length === 0) return null

  let timestamp: string | null = null
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (!value) continue
    if (key === 't') timestamp = value
    if (key === 'v1') signatures.push(value)
  }

  if (!timestamp || !/^[0-9]+$/.test(timestamp) || signatures.length === 0) return null
  return { timestamp, signatures }
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  const bytes = new Uint8Array(signature)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

export async function verifyStripeWebhookSignature(input: {
  payload: string
  header: string | null | undefined
  secret: string | null | undefined
  nowUnix: number
  toleranceSeconds?: number
}): Promise<{ ok: true } | { ok: false; reason: 'missing_header' | 'missing_secret' | 'malformed' | 'mismatch' | 'stale' }> {
  if (typeof input.secret !== 'string' || input.secret.length === 0) {
    return { ok: false, reason: 'missing_secret' }
  }

  const parsed = parseStripeSignatureHeader(input.header)
  if (!input.header) return { ok: false, reason: 'missing_header' }
  if (!parsed) return { ok: false, reason: 'malformed' }

  const expected = await hmacSha256Hex(input.secret, `${parsed.timestamp}.${input.payload}`)
  let match = false
  for (const signature of parsed.signatures) {
    if (timingSafeEqualString(expected, signature)) match = true
  }
  if (!match) return { ok: false, reason: 'mismatch' }

  const tolerance = input.toleranceSeconds ?? STRIPE_SIGNATURE_TOLERANCE_SECONDS
  if (tolerance > 0) {
    const age = input.nowUnix - Number(parsed.timestamp)
    if (age > tolerance) return { ok: false, reason: 'stale' }
  }

  return { ok: true }
}

export function claimAction(
  existing: { outcome: string; receivedAtMs: number } | null,
  nowMs: number,
): WebhookClaimAction {
  if (!existing) return 'insert'
  if (existing.outcome === 'processed' || existing.outcome === 'ignored') return 'duplicate'
  if (existing.outcome === 'error') return 'takeover'
  if (existing.outcome === 'processing') {
    if (!Number.isFinite(existing.receivedAtMs)) return 'takeover'
    if (nowMs - existing.receivedAtMs >= WEBHOOK_CLAIM_STALE_MS) return 'takeover'
    return 'retry_later'
  }
  return 'retry_later'
}

export function readStripeEvent(
  payload: unknown,
): { id: string; type: string; object: Record<string, unknown> } | null {
  if (!payload || typeof payload !== 'object') return null
  const event = payload as { id?: unknown; type?: unknown; data?: { object?: unknown } }
  if (typeof event.id !== 'string' || event.id.length === 0) return null
  if (typeof event.type !== 'string' || event.type.length === 0) return null
  const object = event.data?.object
  if (!object || typeof object !== 'object' || Array.isArray(object)) return null
  return { id: event.id, type: event.type, object: object as Record<string, unknown> }
}

export function metadataServiceId(object: Record<string, unknown>): string | null {
  const metadata = object.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const serviceId = (metadata as Record<string, unknown>).service_id
  if (typeof serviceId !== 'string' || serviceId.length === 0) return null
  return serviceId
}

export function eventPaymentIntentId(eventType: string, object: Record<string, unknown>): string | null {
  if (eventType.startsWith('payment_intent.')) {
    return typeof object.id === 'string' && object.id.length > 0 ? object.id : null
  }

  const paymentIntent = object.payment_intent
  if (typeof paymentIntent === 'string' && paymentIntent.length > 0) return paymentIntent
  if (paymentIntent && typeof paymentIntent === 'object' && !Array.isArray(paymentIntent)) {
    const id = (paymentIntent as Record<string, unknown>).id
    if (typeof id === 'string' && id.length > 0) return id
  }
  return null
}

function normalizedStatus(current: string | null | undefined): string {
  return (current ?? '').trim().toLowerCase()
}

function cents(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function paidFromSuccess(current: string): string | null {
  if (PAID_BLOCKERS.has(current)) return null
  return 'paid'
}

function failedFromDecline(current: string): string | null {
  if (FAILED_ALLOWED.has(current)) return 'failed'
  return null
}

/**
 * Next service.payment_status for a verified Stripe event.
 * Null means the event does not change the row.
 * Object fields named payment_status are ignored.
 */
export function nextPaymentStatus(
  eventType: string,
  object: Record<string, unknown>,
  current: string | null | undefined,
): string | null {
  const status = normalizedStatus(current)

  if (eventType === 'payment_intent.succeeded' || eventType === 'charge.succeeded') {
    return paidFromSuccess(status)
  }

  if (eventType === 'payment_intent.payment_failed' || eventType === 'charge.failed') {
    return failedFromDecline(status)
  }

  if (eventType === 'payment_intent.canceled') {
    if (PAID_BLOCKERS.has(status) || status === 'paid' || status === 'refund_pending') return null
    return 'canceled'
  }

  if (eventType === 'charge.refunded') {
    const amount = cents(object.amount)
    const refunded = cents(object.amount_refunded)
    if (amount === null || refunded === null || refunded <= 0) return null
    if (amount > 0 && refunded >= amount) return 'refunded'
    return 'partially_refunded'
  }

  if (eventType === 'refund.created' || eventType === 'refund.updated' || eventType === 'refund.failed') {
    const refundStatus = typeof object.status === 'string' ? object.status : ''
    const failed = eventType === 'refund.failed' || refundStatus === 'failed' || refundStatus === 'canceled'
    if (failed) return status === 'refund_pending' ? 'paid' : null
    if (refundStatus === 'pending' || refundStatus === 'requires_action') {
      if (status === 'refunded' || status === 'partially_refunded' || status === 'dispute_lost') return null
      return 'refund_pending'
    }
    return null
  }

  if (eventType === 'charge.dispute.created') return 'disputed'

  if (eventType === 'charge.dispute.updated' || eventType === 'charge.dispute.funds_withdrawn') {
    if (status === 'dispute_lost') return null
    return 'disputed'
  }

  if (eventType === 'charge.dispute.funds_reinstated') {
    if (status === 'disputed') return 'paid'
    return null
  }

  if (eventType === 'charge.dispute.closed') {
    const disputeStatus = typeof object.status === 'string' ? object.status : ''
    if (disputeStatus === 'lost') return 'dispute_lost'
    if (disputeStatus === 'charge_refunded') return 'refunded'
    if (disputeStatus === 'won' || disputeStatus === 'warning_closed' || disputeStatus === 'prevented') {
      if (status === 'refunded' || status === 'partially_refunded') return null
      return 'paid'
    }
    return 'disputed'
  }

  return null
}

export function servicePaymentPatch(input: {
  nextStatus: string | null
  eventPaymentIntentId: string | null
  storedPaymentIntentId: string | null
}): { payment_status: string; payment_intent_id?: string } | null {
  if (!input.nextStatus) return null
  const stored = input.storedPaymentIntentId
  const eventPaymentIntent = input.eventPaymentIntentId
  if (stored && eventPaymentIntent && stored !== eventPaymentIntent) return null
  if (!stored && eventPaymentIntent) {
    return { payment_status: input.nextStatus, payment_intent_id: eventPaymentIntent }
  }
  return { payment_status: input.nextStatus }
}
