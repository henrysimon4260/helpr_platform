import { emailsMatch, parseBearerToken } from './chargeAuthorization.ts'

export const CONNECT_SIGN_IN = 'Sign in again before creating a payout account.'
export const CONNECT_FORBIDDEN = 'You can only create a payout account for your own provider profile.'
export const CONNECT_NOT_CONFIGURED = 'Payout account setup is not configured on the server.'
export const CONNECT_UNAVAILABLE = 'Payout account setup could not be verified. Try again.'
export const CONNECT_EMAIL_REQUIRED = 'A verified email is required to create a payout account.'
export const CONNECT_EMAIL_MISMATCH = 'The email does not match the signed-in provider.'
export const CONNECT_BAD_REQUEST = 'The payout account request is invalid.'
export const CONNECT_SSN_INVALID = 'SSN last 4 must be exactly 4 digits.'
export const CONNECT_SSN_REJECTED = 'Full SSN is not accepted.'

const LAST4_KEYS = new Set(['ssn_last_4', 'ssnLast4'])

export type ProviderConnectRow = {
  service_provider_id?: string | null
  email?: string | null
  stripe_account_id?: string | null
}

export type ConnectProfile = {
  firstName?: string
  lastName?: string
  dob?: { day: number; month: number; year: number }
  address?: {
    line1: string
    city: string
    state: string
    postal_code: string
    country: string
  }
}

export type ConnectSession =
  | { ok: true; jwt: string }
  | { ok: false; status: 401; error: string }

export type SsnLast4Result =
  | { ok: true; ssnLast4: string | null }
  | { ok: false; status: 400; error: string }

export type ConnectAuthorization =
  | {
      ok: true
      providerId: string
      email: string
      ssnLast4: string | null
      existingStripeAccountId: string | null
      existingStripeProviderId: string | null
    }
  | { ok: false; status: 400 | 403 | 500; error: string }

export function readConnectSession(authorization: string | null | undefined): ConnectSession {
  const jwt = parseBearerToken(authorization)
  if (!jwt) return { ok: false, status: 401, error: CONNECT_SIGN_IN }
  return { ok: true, jwt }
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readDob(value: unknown): ConnectProfile['dob'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const dob = value as Record<string, unknown>
  const { day, month, year } = dob
  if (typeof day !== 'number' || typeof month !== 'number' || typeof year !== 'number') return undefined
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return undefined
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) return undefined
  return { day, month, year }
}

function readAddress(value: unknown): ConnectProfile['address'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const address = value as Record<string, unknown>
  const line1 = optionalString(address.line1)
  const city = optionalString(address.city)
  const state = optionalString(address.state)
  const postalCode = optionalString(address.postal_code)
  if (!line1 || !city || !state || !postalCode) return undefined
  const country = optionalString(address.country)
  return {
    line1,
    city,
    state,
    postal_code: postalCode,
    country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : 'US',
  }
}

/** Copies only the Stripe profile fields. Extra keys, including any SSN, are dropped. */
export function readConnectProfile(body: Record<string, unknown>): ConnectProfile {
  const firstName = optionalString(body.firstName) ?? optionalString(body.first_name)
  const lastName = optionalString(body.lastName) ?? optionalString(body.last_name)
  const dob = readDob(body.dob)
  const address = readAddress(body.address)
  return {
    ...(firstName && { firstName }),
    ...(lastName && { lastName }),
    ...(dob && { dob }),
    ...(address && { address }),
  }
}

function unexpectedSsnField(body: Record<string, unknown>): boolean {
  return Object.entries(body).some(([key, value]) => {
    if (LAST4_KEYS.has(key)) return false
    if (value === undefined || value === null || value === '') return false
    return /ssn|social.?security|tax.?id|id_number/i.test(key)
  })
}

function readLast4Value(value: unknown): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return 'invalid'
  const digits = value.trim()
  if (!/^\d{4}$/.test(digits)) return 'invalid'
  return digits
}

/**
 * Accepts exactly four digits in ssn_last_4 / ssnLast4.
 * A full SSN field is rejected. The returned error never includes the submitted value.
 */
export function readSsnLast4(body: Record<string, unknown>): SsnLast4Result {
  if (unexpectedSsnField(body)) {
    return { ok: false, status: 400, error: CONNECT_SSN_REJECTED }
  }

  const snake = readLast4Value(body.ssn_last_4)
  const camel = readLast4Value(body.ssnLast4)
  if (snake === 'invalid' || camel === 'invalid') {
    return { ok: false, status: 400, error: CONNECT_SSN_INVALID }
  }
  if (snake && camel && snake !== camel) {
    return { ok: false, status: 400, error: CONNECT_SSN_INVALID }
  }
  return { ok: true, ssnLast4: snake ?? camel }
}

export function readClientEmail(value: unknown): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return 'invalid'
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function readClientProviderId(body: Record<string, unknown>): string | null | 'invalid' | 'conflict' {
  const values = [body.providerId, body.service_provider_id, body.serviceProviderId]
  const present = values.filter((value) => value !== undefined && value !== null && value !== '')
  if (present.some((value) => typeof value !== 'string')) return 'invalid'
  const ids = present
    .map((value) => (value as string).trim())
    .filter((value) => value.length > 0)
  const unique = new Set(ids)
  if (unique.size > 1) return 'conflict'
  return ids[0] ?? null
}

function rowId(row: ProviderConnectRow | null | undefined): string | null {
  if (!row || typeof row.service_provider_id !== 'string') return null
  const id = row.service_provider_id.trim()
  return id.length > 0 ? id : null
}

function stripeAccountId(row: ProviderConnectRow | null | undefined): string | null {
  if (!row || typeof row.stripe_account_id !== 'string') return null
  const id = row.stripe_account_id.trim()
  return id.length > 0 ? id : null
}

function stripeRef(row: ProviderConnectRow | null | undefined): { accountId: string; providerId: string } | null {
  const accountId = stripeAccountId(row)
  const providerId = rowId(row)
  if (!accountId || !providerId) return null
  return { accountId, providerId }
}

/**
 * The signed-in provider is the only account this call may create.
 * provider id is the auth user id, or a legacy service_provider row whose
 * email matches getUser() when this auth user has no row of their own.
 * Email comes from getUser(), not user_metadata. A client provider id is
 * accepted only when it is the auth user or that resolved row.
 */
export function authorizeConnectAccount(input: {
  authUserId: string | null | undefined
  authEmail?: string | null
  clientProviderId: string | null
  clientEmail: string | null
  accounts: ProviderConnectRow[]
  accountLookupFailed?: boolean
  ssnLast4: string | null
}): ConnectAuthorization {
  const authId = typeof input.authUserId === 'string' ? input.authUserId.trim() : ''
  if (!authId) return { ok: false, status: 403, error: CONNECT_FORBIDDEN }
  if (input.accountLookupFailed) return { ok: false, status: 500, error: CONNECT_UNAVAILABLE }

  const email = typeof input.authEmail === 'string' ? input.authEmail.trim() : ''
  if (!email) return { ok: false, status: 400, error: CONNECT_EMAIL_REQUIRED }
  if (input.clientEmail && !emailsMatch(input.clientEmail, email)) {
    return { ok: false, status: 400, error: CONNECT_EMAIL_MISMATCH }
  }

  const callerRows = input.accounts.filter((row) => {
    const id = rowId(row)
    if (!id) return false
    if (id === authId) return true
    return emailsMatch(email, row.email)
  })
  const owned = callerRows.filter((row) => rowId(row) === authId)
  const legacy = callerRows.filter((row) => rowId(row) !== authId)
  if (owned.length > 1 || legacy.length > 1) {
    return { ok: false, status: 500, error: CONNECT_UNAVAILABLE }
  }

  const bound = owned[0] ?? legacy[0] ?? null
  const providerId = rowId(bound) ?? authId
  if (
    input.clientProviderId
    && input.clientProviderId !== providerId
    && input.clientProviderId !== authId
  ) {
    return { ok: false, status: 403, error: CONNECT_FORBIDDEN }
  }

  const existing = stripeRef(bound)
    ?? legacy.map((row) => stripeRef(row)).find((ref) => ref !== null)
    ?? null

  return {
    ok: true,
    providerId,
    email,
    ssnLast4: input.ssnLast4,
    existingStripeAccountId: existing?.accountId ?? null,
    existingStripeProviderId: existing?.providerId ?? null,
  }
}

export function connectAccountIdentity(input: {
  providerId: string
  email: string
  firstName?: string
  lastName?: string
  ssnLast4: string | null
  dob?: ConnectProfile['dob']
  address?: ConnectProfile['address']
}): {
  email: string
  metadata: { provider_id: string; email: string }
  individual: Record<string, unknown>
} {
  return {
    email: input.email,
    metadata: {
      provider_id: input.providerId,
      email: input.email,
    },
    individual: {
      ...(input.firstName && { first_name: input.firstName }),
      ...(input.lastName && { last_name: input.lastName }),
      email: input.email,
      ...(input.dob && { dob: input.dob }),
      ...(input.address && { address: input.address }),
      ...(input.ssnLast4 && { ssn_last_4: input.ssnLast4 }),
    },
  }
}

export function connectLogFields(input: {
  providerId: string
  hasDob: boolean
  hasAddress: boolean
  hasSsnLast4: boolean
}): { providerId: string; hasDob: boolean; hasAddress: boolean; hasSsnLast4: boolean } {
  return {
    providerId: input.providerId,
    hasDob: input.hasDob,
    hasAddress: input.hasAddress,
    hasSsnLast4: input.hasSsnLast4,
  }
}

export function redactSensitiveText(message: string): string {
  return message.replace(/\d{3,}/g, '[redacted]')
}

export function stripeAccountMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const stripeError = error as { code?: string; statusCode?: number }
  return stripeError.code === 'resource_missing' || stripeError.statusCode === 404
}
