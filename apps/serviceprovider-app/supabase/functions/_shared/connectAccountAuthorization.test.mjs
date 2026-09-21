import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  CONNECT_EMAIL_MISMATCH,
  CONNECT_EMAIL_REQUIRED,
  CONNECT_FORBIDDEN,
  CONNECT_SIGN_IN,
  CONNECT_SSN_INVALID,
  CONNECT_SSN_REJECTED,
  CONNECT_UNAVAILABLE,
  authorizeConnectAccount,
  connectAccountIdentity,
  connectLogFields,
  readClientProviderId,
  readConnectProfile,
  readConnectSession,
  readSsnLast4,
  redactSensitiveText,
} from './connectAccountAuthorization.ts'

const signedIn = {
  authUserId: 'provider-auth-1',
  authEmail: 'Pro@Example.com',
  clientProviderId: null,
  clientEmail: null,
  accounts: [],
  ssnLast4: null,
}

test('a missing bearer token is rejected before any account lookup', () => {
  for (const header of [null, undefined, '', 'Bearer', 'Bearer ', 'Basic abc', 'bearer']) {
    const session = readConnectSession(header)
    assert.equal(session.ok, false)
    if (!session.ok) {
      assert.equal(session.status, 401)
      assert.equal(session.error, CONNECT_SIGN_IN)
    }
  }

  const session = readConnectSession('Bearer user-access-token')
  assert.equal(session.ok, true)
  if (session.ok) assert.equal(session.jwt, 'user-access-token')
})

test('a signed-in provider with no profile is bound to their auth user id', () => {
  const decision = authorizeConnectAccount({
    ...signedIn,
    clientEmail: 'pro@example.com',
    clientProviderId: 'provider-auth-1',
  })
  assert.equal(decision.ok, true)
  if (decision.ok) {
    assert.equal(decision.providerId, 'provider-auth-1')
    assert.equal(decision.email, 'Pro@Example.com')
    assert.equal(decision.existingStripeAccountId, null)
  }
})

test('a client provider id for someone else is forbidden', () => {
  const decision = authorizeConnectAccount({
    ...signedIn,
    clientProviderId: 'provider-auth-2',
    accounts: [
      { service_provider_id: 'provider-auth-2', email: 'other@example.com', stripe_account_id: 'acct_other' },
    ],
  })
  assert.equal(decision.ok, false)
  if (!decision.ok) {
    assert.equal(decision.status, 403)
    assert.equal(decision.error, CONNECT_FORBIDDEN)
  }
  assert.equal(JSON.stringify(decision).includes('acct_other'), false)
})

test('a client email that does not match getUser is rejected', () => {
  const mismatch = authorizeConnectAccount({
    ...signedIn,
    clientEmail: 'other@example.com',
  })
  assert.equal(mismatch.ok, false)
  if (!mismatch.ok) {
    assert.equal(mismatch.status, 400)
    assert.equal(mismatch.error, CONNECT_EMAIL_MISMATCH)
  }

  const missing = authorizeConnectAccount({
    ...signedIn,
    authEmail: '   ',
  })
  assert.equal(missing.ok, false)
  if (!missing.ok) {
    assert.equal(missing.status, 400)
    assert.equal(missing.error, CONNECT_EMAIL_REQUIRED)
  }
})

test('legacy profile is used only when this auth user has no provider row', () => {
  const legacy = authorizeConnectAccount({
    ...signedIn,
    clientProviderId: 'provider-auth-1',
    accounts: [
      { service_provider_id: 'legacy-provider', email: 'pro@example.com', stripe_account_id: null },
    ],
  })
  assert.equal(legacy.ok, true)
  if (legacy.ok) assert.equal(legacy.providerId, 'legacy-provider')

  const ownWins = authorizeConnectAccount({
    ...signedIn,
    accounts: [
      { service_provider_id: 'provider-auth-1', email: 'pro@example.com', stripe_account_id: null },
      { service_provider_id: 'legacy-provider', email: 'pro@example.com', stripe_account_id: 'acct_legacy' },
    ],
  })
  assert.equal(ownWins.ok, true)
  if (ownWins.ok) {
    assert.equal(ownWins.providerId, 'provider-auth-1')
    assert.equal(ownWins.existingStripeAccountId, 'acct_legacy')
    assert.equal(ownWins.existingStripeProviderId, 'legacy-provider')
  }
})

test('another provider row is not treated as the caller account', () => {
  const decision = authorizeConnectAccount({
    ...signedIn,
    accounts: [
      { service_provider_id: 'other', email: 'other@example.com', stripe_account_id: 'acct_other' },
    ],
  })
  assert.equal(decision.ok, true)
  if (decision.ok) {
    assert.equal(decision.providerId, 'provider-auth-1')
    assert.equal(decision.existingStripeAccountId, null)
  }
})

test('ambiguous or failed provider lookup does not authorize account creation', () => {
  const ambiguous = authorizeConnectAccount({
    ...signedIn,
    accounts: [
      { service_provider_id: 'legacy-1', email: 'pro@example.com', stripe_account_id: null },
      { service_provider_id: 'legacy-2', email: 'PRO@example.com', stripe_account_id: null },
    ],
  })
  assert.equal(ambiguous.ok, false)
  if (!ambiguous.ok) assert.equal(ambiguous.status, 500)

  const failed = authorizeConnectAccount({
    ...signedIn,
    accountLookupFailed: true,
    accounts: [],
  })
  assert.equal(failed.ok, false)
  if (!failed.ok) {
    assert.equal(failed.status, 500)
    assert.equal(failed.error, CONNECT_UNAVAILABLE)
  }
})

test('conflicting client provider ids are rejected', () => {
  assert.equal(readClientProviderId({
    providerId: 'provider-auth-1',
    service_provider_id: 'provider-auth-2',
  }), 'conflict')
  assert.equal(readClientProviderId({ providerId: 12 }), 'invalid')
  assert.equal(readClientProviderId({ providerId: 'provider-auth-1' }), 'provider-auth-1')
})

test('full SSN is rejected and last4 is only four digits', () => {
  const full = '123456789'
  const rejected = readSsnLast4({ ssn: full, ssn_last_4: '6789' })
  assert.equal(rejected.ok, false)
  if (!rejected.ok) assert.equal(rejected.error, CONNECT_SSN_REJECTED)
  assert.equal(JSON.stringify(rejected).includes(full), false)

  const nine = readSsnLast4({ ssn_last_4: full })
  assert.equal(nine.ok, false)
  if (!nine.ok) assert.equal(nine.error, CONNECT_SSN_INVALID)
  assert.equal(JSON.stringify(nine).includes(full), false)

  const last4 = readSsnLast4({ ssn_last_4: ' 6789 ' })
  assert.deepEqual(last4, { ok: true, ssnLast4: '6789' })

  const mismatch = readSsnLast4({ ssn_last_4: '6789', ssnLast4: '1111' })
  assert.equal(mismatch.ok, false)
})

test('profile parsing drops SSN and other unexpected identity fields', () => {
  const full = '123456789'
  const profile = readConnectProfile({
    firstName: 'Ada',
    last_name: 'Lovelace',
    dob: { day: 10, month: 12, year: 1990, ssn: full },
    address: {
      line1: '1 Main',
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      country: 'us',
      ssn_last_4: '6789',
    },
    ssn: full,
  })
  assert.equal(JSON.stringify(profile).includes(full), false)
  assert.equal(JSON.stringify(profile).includes('6789'), false)
  assert.deepEqual(profile, {
    firstName: 'Ada',
    lastName: 'Lovelace',
    dob: { day: 10, month: 12, year: 1990 },
    address: {
      line1: '1 Main',
      city: 'Austin',
      state: 'TX',
      postal_code: '78701',
      country: 'US',
    },
  })
})

test('Stripe identity carries last4 only and logs omit it', () => {
  const identity = connectAccountIdentity({
    providerId: 'provider-auth-1',
    email: 'pro@example.com',
    firstName: 'Ada',
    ssnLast4: '6789',
  })
  assert.equal(identity.individual.ssn_last_4, '6789')
  assert.deepEqual(Object.keys(identity.metadata).sort(), ['email', 'provider_id'])
  assert.equal('ssn' in identity.individual, false)
  assert.equal('id_number' in identity.individual, false)

  const withoutSsn = connectAccountIdentity({
    providerId: 'provider-auth-1',
    email: 'pro@example.com',
    ssnLast4: null,
  })
  assert.equal('ssn_last_4' in withoutSsn.individual, false)

  const fields = connectLogFields({
    providerId: 'provider-auth-1',
    hasDob: true,
    hasAddress: false,
    hasSsnLast4: true,
  })
  assert.deepEqual(fields, {
    providerId: 'provider-auth-1',
    hasDob: true,
    hasAddress: false,
    hasSsnLast4: true,
  })
  assert.equal(JSON.stringify(fields).includes('6789'), false)
  assert.equal(redactSensitiveText('ssn_last_4 6789 was rejected'), 'ssn_last_4 [redacted] was rejected')
})

test('the handler requires a user JWT before it reads the body or calls Stripe', () => {
  const source = readFileSync(new URL('../create-connect-account/index.ts', import.meta.url), 'utf8')
  const config = readFileSync(new URL('../create-connect-account/config.toml', import.meta.url), 'utf8')
  const session = source.indexOf('readConnectSession(')
  const getUser = source.indexOf('auth.getUser')
  const readBody = source.indexOf('req.json')
  const stripe = source.indexOf('new Stripe(')
  assert.ok(session > 0)
  assert.ok(getUser > session)
  assert.ok(readBody > getUser)
  assert.ok(stripe > readBody)
  assert.equal(source.includes('user_metadata'), false)
  assert.equal(source.includes('JSON.stringify(body)'), false)
  assert.match(config, /verify_jwt\s*=\s*true/)
  assert.doesNotMatch(config, /verify_jwt\s*=\s*false/)

  const consoleLines = source.split('\n').filter((line) => line.includes('console.'))
  for (const line of consoleLines) {
    assert.equal(/ssn|JSON\.stringify\(body\)|user_metadata/i.test(line), false, line)
  }
})
