import { bookingChargeCents, parseBidDollars } from './autofillPayment.ts'

/**
 * Customer confirm and AutoFill both charge with bookingChargeCents
 * (bid + 3% processing + 1% platform). complete-service settles that same
 * quote and caps the transfer at the charge minus Stripe's fee.
 */
export const CHARGE_SIGN_IN = 'Sign in again before confirming this booking.'
export const CHARGE_FORBIDDEN = 'You cannot charge this booking.'
export const CHARGE_AMOUNT_MISMATCH = 'The charge amount does not match this booking.'
export const CHARGE_PAYMENT_METHOD_FORBIDDEN = 'That payment method cannot be used for this booking.'
export const CHARGE_NOT_CHARGEABLE = 'This booking cannot be charged.'
export const CHARGE_NOT_CONFIGURED = 'Payment is not configured on the server.'
export const CHARGE_UNAVAILABLE = 'Payment could not be verified. Try again.'

const OPEN_CONFIRM_STATUSES = new Set([
  'finding_pros',
  'pending',
  'scheduled',
  'select_service_provider',
])

const ACCEPTED_STATUSES = new Set([
  'confirmed',
  'helpr_otw',
  'in_progress',
  'completed',
])

export type ChargeAmountDecision =
  | { ok: true; amountCents: number; source: 'fill_request' | 'service_price' }
  | {
      ok: false
      reason: 'amount_mismatch' | 'ambiguous' | 'no_authoritative_amount' | 'provider_mismatch'
    }

export type CustomerChargeApproval = {
  ok: true
  amountCents: number
  customerId: string
  email: string
  paymentMethodId: string
  reuseOnly: boolean
  storedPaymentIntentId: string | null
}

export type CustomerChargeDenial = {
  ok: false
  status: 400 | 403
  error: string
}

export function parseBearerToken(header: string | null | undefined): string | null {
  if (typeof header !== 'string') return null
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header)
  if (!match) return null
  return match[1].length > 0 ? match[1] : null
}

export function emailsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const a = left.trim().toLowerCase()
  const b = right.trim().toLowerCase()
  if (!a || !b) return false
  return a === b
}

/**
 * The signed-in auth user owns the service when their id is the service
 * customer id, or their auth email matches the customer row. Email on the
 * auth user comes from getUser(), not from user_metadata.
 */
export function callerOwnsServiceCustomer(input: {
  authUserId: string | null | undefined
  authEmail?: string | null
  serviceCustomerId?: string | null
  customerEmail?: string | null
}): boolean {
  if (!input.authUserId || !input.serviceCustomerId) return false
  if (input.authUserId === input.serviceCustomerId) return true
  return emailsMatch(input.authEmail, input.customerEmail)
}

export function readClientAmountCents(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return 'invalid'
  return value
}

export function currencyAccepted(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true
  return typeof value === 'string' && value.trim().toLowerCase() === 'usd'
}

export function isOpenCustomerCharge(
  status: string | null | undefined,
  serviceProviderId: string | null | undefined,
): boolean {
  if (typeof serviceProviderId === 'string' && serviceProviderId.length > 0) return false
  return OPEN_CONFIRM_STATUSES.has((status ?? '').toLowerCase())
}

export function paymentMethodBelongsToOwner(
  rows: Array<{ stripe_pm_id?: unknown; user_id?: unknown }>,
  paymentMethodId: string,
  ownerIds: readonly string[],
): boolean {
  if (!paymentMethodId) return false
  const owners = new Set(ownerIds.filter((id) => typeof id === 'string' && id.length > 0))
  if (owners.size === 0) return false
  return rows.some((row) =>
    row.stripe_pm_id === paymentMethodId
    && typeof row.user_id === 'string'
    && owners.has(row.user_id),
  )
}

/**
 * An unattached PaymentMethod can be saved onto this booking's Stripe customer.
 * One already attached to a different Stripe customer cannot.
 */
export function stripePaymentMethodCustomerAllowed(
  paymentMethodCustomer: string | null | undefined,
  stripeCustomerId: string,
): boolean {
  if (!stripeCustomerId) return false
  if (paymentMethodCustomer === undefined || paymentMethodCustomer === null || paymentMethodCustomer === '') {
    return true
  }
  return paymentMethodCustomer === stripeCustomerId
}

function chargeCentsForBid(bid: unknown): number | null {
  const dollars = parseBidDollars(bid)
  if (dollars === null) return null
  return bookingChargeCents(dollars)
}

function acceptClientAmount(
  expectedCents: number,
  clientAmountCents: number | null,
  source: 'fill_request' | 'service_price',
): ChargeAmountDecision {
  if (clientAmountCents !== null && clientAmountCents !== expectedCents) {
    return { ok: false, reason: 'amount_mismatch' }
  }
  return { ok: true, amountCents: expectedCents, source }
}

/**
 * Pre-accept, the authoritative base is a fill-request bid. service.price is
 * still the customer's estimate until accept copies the bid into it.
 * After accept, with fill requests gone, service.price is that bid.
 * The charged cents are always bookingChargeCents of that base. A client
 * amount is accepted only when it equals that total.
 */
export function resolveCustomerChargeAmount(input: {
  fillRequests: Array<{ service_provider_id?: string | null; bid: unknown }>
  servicePrice?: unknown
  assignedProviderId?: string | null
  requestedProviderId?: string | null
  clientAmountCents: number | null
  status?: string | null
}): ChargeAmountDecision {
  const bids = input.fillRequests.flatMap((row) => {
    const cents = chargeCentsForBid(row.bid)
    if (cents === null) return []
    const providerId = typeof row.service_provider_id === 'string' && row.service_provider_id.length > 0
      ? row.service_provider_id
      : null
    return [{ providerId, cents }]
  })

  const requested = typeof input.requestedProviderId === 'string' && input.requestedProviderId.trim().length > 0
    ? input.requestedProviderId.trim()
    : null

  if (requested) {
    const match = bids.find((bid) => bid.providerId === requested)
    if (!match) return { ok: false, reason: 'provider_mismatch' }
    return acceptClientAmount(match.cents, input.clientAmountCents, 'fill_request')
  }

  if (bids.length > 0) {
    if (input.clientAmountCents === null) {
      const unique = new Set(bids.map((bid) => bid.cents))
      if (unique.size !== 1) return { ok: false, reason: 'ambiguous' }
      return { ok: true, amountCents: bids[0].cents, source: 'fill_request' }
    }
    if (!bids.some((bid) => bid.cents === input.clientAmountCents)) {
      return { ok: false, reason: 'amount_mismatch' }
    }
    return { ok: true, amountCents: input.clientAmountCents, source: 'fill_request' }
  }

  const accepted = (typeof input.assignedProviderId === 'string' && input.assignedProviderId.length > 0)
    || ACCEPTED_STATUSES.has((input.status ?? '').toLowerCase())
  if (!accepted) return { ok: false, reason: 'no_authoritative_amount' }

  const fromPrice = chargeCentsForBid(input.servicePrice)
  if (fromPrice === null) return { ok: false, reason: 'no_authoritative_amount' }
  return acceptClientAmount(fromPrice, input.clientAmountCents, 'service_price')
}

function amountFailure(reason: ChargeAmountDecision & { ok: false }): CustomerChargeDenial {
  if (reason.reason === 'amount_mismatch') {
    return { ok: false, status: 400, error: CHARGE_AMOUNT_MISMATCH }
  }
  return { ok: false, status: 400, error: CHARGE_NOT_CHARGEABLE }
}

function readOptionalString(value: unknown): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return 'invalid'
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Fail closed for a customer confirm. The returned amount is the server total.
 * reuseOnly means the job is no longer an open unassigned booking, so the
 * caller may return a stored PaymentIntent and must not create another charge.
 */
export function evaluateCustomerCharge(input: {
  authUserId: string
  authEmail?: string | null
  service: {
    customer_id?: string | null
    price?: unknown
    status?: string | null
    service_provider_id?: string | null
    payment_intent_id?: string | null
  } | null
  customerEmail?: string | null
  fillRequests: Array<{ service_provider_id?: string | null; bid: unknown }>
  paymentMethods: Array<{ stripe_pm_id?: unknown; user_id?: unknown }>
  body: {
    amount?: unknown
    currency?: unknown
    payment_method_id?: unknown
    customer_id?: unknown
    customer_email?: unknown
    service_provider_id?: unknown
  }
}): CustomerChargeApproval | CustomerChargeDenial {
  const serviceCustomerId = typeof input.service?.customer_id === 'string' && input.service.customer_id.length > 0
    ? input.service.customer_id
    : null
  if (!input.service || !serviceCustomerId) {
    return { ok: false, status: 400, error: CHARGE_NOT_CHARGEABLE }
  }

  const bodyCustomerId = readOptionalString(input.body.customer_id)
  if (bodyCustomerId === 'invalid' || (bodyCustomerId && bodyCustomerId !== serviceCustomerId)) {
    return { ok: false, status: 400, error: CHARGE_NOT_CHARGEABLE }
  }

  if (!callerOwnsServiceCustomer({
    authUserId: input.authUserId,
    authEmail: input.authEmail,
    serviceCustomerId,
    customerEmail: input.customerEmail,
  })) {
    return { ok: false, status: 403, error: CHARGE_FORBIDDEN }
  }

  if (!currencyAccepted(input.body.currency)) {
    return { ok: false, status: 400, error: CHARGE_NOT_CHARGEABLE }
  }

  const bodyEmail = readOptionalString(input.body.customer_email)
  if (bodyEmail === 'invalid' || (bodyEmail && !emailsMatch(bodyEmail, input.customerEmail))) {
    return { ok: false, status: 400, error: CHARGE_NOT_CHARGEABLE }
  }

  const email = typeof input.customerEmail === 'string' ? input.customerEmail.trim() : ''
  if (!email) {
    return { ok: false, status: 400, error: CHARGE_NOT_CHARGEABLE }
  }

  const clientAmount = readClientAmountCents(input.body.amount)
  if (clientAmount === 'invalid') {
    return { ok: false, status: 400, error: CHARGE_AMOUNT_MISMATCH }
  }

  const amount = resolveCustomerChargeAmount({
    fillRequests: input.fillRequests,
    servicePrice: input.service.price,
    assignedProviderId: input.service.service_provider_id,
    requestedProviderId: typeof input.body.service_provider_id === 'string'
      ? input.body.service_provider_id
      : null,
    clientAmountCents: clientAmount,
    status: input.service.status,
  })
  if (!amount.ok) return amountFailure(amount)

  const paymentMethodId = readOptionalString(input.body.payment_method_id)
  if (paymentMethodId === 'invalid' || !paymentMethodId) {
    return { ok: false, status: 400, error: CHARGE_NOT_CHARGEABLE }
  }

  const ownerIds = [input.authUserId, serviceCustomerId]
  if (!paymentMethodBelongsToOwner(input.paymentMethods, paymentMethodId, ownerIds)) {
    return { ok: false, status: 403, error: CHARGE_PAYMENT_METHOD_FORBIDDEN }
  }

  const stored = typeof input.service.payment_intent_id === 'string' && input.service.payment_intent_id.length > 0
    ? input.service.payment_intent_id
    : null

  return {
    ok: true,
    amountCents: amount.amountCents,
    customerId: serviceCustomerId,
    email,
    paymentMethodId,
    reuseOnly: !isOpenCustomerCharge(input.service.status, input.service.service_provider_id),
    storedPaymentIntentId: stored,
  }
}

/**
 * AutoFill already computes the amount and payment method. A client-supplied
 * amount or payment method may only echo those server values.
 */
export function rejectedClientOverride(input: {
  clientAmount: unknown
  serverAmountCents: number
  clientPaymentMethodId: unknown
  serverPaymentMethodId: string
}): { status: 400 | 403; error: string } | null {
  const amount = readClientAmountCents(input.clientAmount)
  if (amount === 'invalid' || (amount !== null && amount !== input.serverAmountCents)) {
    return { status: 400, error: CHARGE_AMOUNT_MISMATCH }
  }

  if (
    input.clientPaymentMethodId === undefined
    || input.clientPaymentMethodId === null
    || input.clientPaymentMethodId === ''
  ) {
    return null
  }

  if (input.clientPaymentMethodId !== input.serverPaymentMethodId) {
    return { status: 403, error: CHARGE_PAYMENT_METHOD_FORBIDDEN }
  }

  return null
}
