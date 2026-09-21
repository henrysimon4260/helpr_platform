import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import {
  authUserIdsForEmail,
  bookingChargeCents,
  isAlreadyRefunded,
  parseBidDollars,
  pickSavedPaymentMethodId,
  readStripePaymentIntentId,
  unclaimedPaymentRelease,
} from '../_shared/autofillPayment.ts'
import {
  PaymentIntentCreateError,
  autofillStoredIntentAction,
  chargeReuseDecision,
  idempotencyKeySegment,
  isFullyRefunded,
  pickReusablePaymentIntent,
  preferredPaymentIntentId,
  resolveIdempotentPaymentIntent,
  type PaymentIntentSnapshot,
} from '../_shared/paymentIntentIdempotency.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://hecikcopbdhhiilhgmrd.supabase.co'
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const AUTOFILL_CHARGE_FAILED = 'The customer payment method could not be charged, so this AutoFill job was not confirmed.'
const AUTOFILL_NO_PAYMENT_METHOD = 'The customer has no saved payment method, so this AutoFill job was not confirmed.'
const AUTOFILL_NOT_OPEN = 'This AutoFill job is no longer available.'
const AUTOFILL_SIGN_IN = 'Sign in again before claiming this AutoFill job.'

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function findOrCreateStripeCustomer(
  stripe: Stripe,
  email: string,
  name?: string,
): Promise<string> {
  const existing = await stripe.customers.list({ email, limit: 1 })
  if (existing.data.length > 0) {
    return existing.data[0].id
  }

  const customer = await stripe.customers.create({
    email,
    ...(name && { name }),
  })
  return customer.id
}

async function attachPaymentMethodToCustomer(
  stripe: Stripe,
  paymentMethodId: string,
  customerId: string,
): Promise<void> {
  try {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId })
  } catch (err: unknown) {
    const stripeErr = err as { code?: string }
    if (stripeErr.code === 'resource_already_exists') {
      return
    }
    throw err
  }
}

async function requireUserId(req: Request): Promise<string | null> {
  if (!supabaseServiceKey) {
    return null
  }

  const header = req.headers.get('Authorization') ?? ''
  const jwt = header.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) {
    return null
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data.user?.id) {
    console.error('AutoFill charge rejected: caller is not signed in', error)
    return null
  }

  return data.user.id
}

async function findAuthUserIdsByEmail(email: string): Promise<string[]> {
  if (!supabaseServiceKey) {
    return []
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users?filter=${encodeURIComponent(email.trim())}`
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${supabaseServiceKey}`,
      apikey: supabaseServiceKey,
    },
  })

  if (!response.ok) {
    console.error('Auth admin user lookup failed:', response.status)
    return []
  }

  const payload = await response.json()
  return authUserIdsForEmail(payload, email)
}

type ResolvedAutoFillCharge = {
  amount: number
  paymentMethodId: string
  email: string
  providerId: string
  storedPaymentIntentId: string | null
}

async function resolveAutoFillCharge(
  req: Request,
  serviceId: string,
  customerId: string,
): Promise<{ ok: true; charge: ResolvedAutoFillCharge } | { ok: false; response: Response }> {
  if (!serviceId || !customerId) {
    return { ok: false, response: jsonResponse({ error: AUTOFILL_NOT_OPEN }, 400) }
  }

  if (!supabaseServiceKey) {
    console.error('Cannot resolve AutoFill payment method: SUPABASE_SERVICE_ROLE_KEY is not set')
    return { ok: false, response: jsonResponse({ error: AUTOFILL_CHARGE_FAILED }, 500) }
  }

  const providerId = await requireUserId(req)
  if (!providerId) {
    return { ok: false, response: jsonResponse({ error: AUTOFILL_SIGN_IN }, 401) }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data: service, error: serviceError } = await supabase
    .from('service')
    .select('service_id, customer_id, status, service_provider_id, autofill_type, payment_intent_id')
    .eq('service_id', serviceId)
    .maybeSingle()

  if (serviceError || !service || service.customer_id !== customerId) {
    console.error('AutoFill charge rejected: service is missing or customer does not match', serviceError)
    return { ok: false, response: jsonResponse({ error: AUTOFILL_NOT_OPEN }, 400) }
  }

  const status = (service.status ?? '').toString().toLowerCase()
  const autofillType = (service.autofill_type ?? '').toString().toLowerCase()
  if (
    !['finding_pros', 'select_service_provider'].includes(status)
    || service.service_provider_id
    || autofillType !== 'autofill'
  ) {
    return { ok: false, response: jsonResponse({ error: AUTOFILL_NOT_OPEN }, 400) }
  }

  const { data: fillRequest, error: fillError } = await supabase
    .from('service_fill_request')
    .select('bid')
    .eq('service_id', serviceId)
    .eq('service_provider_id', providerId)
    .maybeSingle()

  if (fillError || !fillRequest) {
    console.error('AutoFill charge rejected: fill request missing', fillError)
    return { ok: false, response: jsonResponse({ error: AUTOFILL_NOT_OPEN }, 400) }
  }

  const bid = parseBidDollars(fillRequest.bid)
  const amount = bid === null ? null : bookingChargeCents(bid)
  if (amount === null) {
    return { ok: false, response: jsonResponse({ error: AUTOFILL_CHARGE_FAILED }, 400) }
  }

  const { data: customer, error: customerError } = await supabase
    .from('customer')
    .select('email')
    .eq('customer_id', customerId)
    .maybeSingle()

  if (customerError) {
    console.error('AutoFill charge rejected: customer lookup failed', customerError)
  }

  const email = typeof customer?.email === 'string' ? customer.email.trim() : ''
  if (!email) {
    return { ok: false, response: jsonResponse({ error: AUTOFILL_NO_PAYMENT_METHOD }, 400) }
  }

  const authUserIds = await findAuthUserIdsByEmail(email)
  const userIds = Array.from(new Set([...authUserIds, customerId]))
  const { data: methods, error: methodError } = await supabase
    .from('payment_methods')
    .select('stripe_pm_id, is_default, created_at, user_id')
    .in('user_id', userIds)

  if (methodError) {
    console.error('AutoFill charge rejected: payment method lookup failed', methodError)
    return { ok: false, response: jsonResponse({ error: AUTOFILL_NO_PAYMENT_METHOD }, 400) }
  }

  const preferredUserIds = authUserIds.length > 0 ? new Set(authUserIds) : null
  const preferredRows = preferredUserIds
    ? (methods ?? []).filter(row => preferredUserIds.has(row.user_id))
    : (methods ?? [])
  const paymentMethodId = pickSavedPaymentMethodId(preferredRows.length > 0 ? preferredRows : (methods ?? []))

  if (!paymentMethodId) {
    return { ok: false, response: jsonResponse({ error: AUTOFILL_NO_PAYMENT_METHOD }, 400) }
  }

  const storedPaymentIntentId = typeof service.payment_intent_id === 'string' && service.payment_intent_id.length > 0
    ? service.payment_intent_id
    : null

  return {
    ok: true,
    charge: { amount, paymentMethodId, email, providerId, storedPaymentIntentId },
  }
}

function toSnapshot(paymentIntent: Stripe.PaymentIntent): PaymentIntentSnapshot {
  return {
    id: paymentIntent.id,
    status: paymentIntent.status,
    created: paymentIntent.created,
    amount: paymentIntent.amount,
    amount_refunded: paymentIntent.amount_refunded,
    amount_received: paymentIntent.amount_received,
    client_secret: paymentIntent.client_secret,
    chargePath: paymentIntent.metadata?.charge_path ?? null,
    metadataProviderId: paymentIntent.metadata?.provider_id ?? null,
  }
}

function stripeErrorToCreateError(error: unknown): PaymentIntentCreateError {
  const record = error as { type?: unknown; raw?: { type?: unknown }; message?: unknown }
  const type = record?.type ?? record?.raw?.type
  const message = error instanceof Error
    ? error.message
    : typeof record?.message === 'string'
      ? record.message
      : 'Failed to create payment intent'
  return new PaymentIntentCreateError(
    message,
    readStripePaymentIntentId(error),
    type === 'idempotency_error',
  )
}

async function releaseUnattachedPaymentIntent(stripe: Stripe, paymentIntentId: string): Promise<boolean> {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
    if (isFullyRefunded(toSnapshot(paymentIntent))) {
      return true
    }

    const release = unclaimedPaymentRelease(paymentIntent.status)
    if (release === 'none') {
      return true
    }
    if (release === 'refund') {
      try {
        await stripe.refunds.create(
          { payment_intent: paymentIntentId },
          { idempotencyKey: `helpr-release-${paymentIntentId}` },
        )
      } catch (refundError) {
        if (!isAlreadyRefunded(refundError)) {
          throw refundError
        }
      }
      return true
    }
    if (release === 'cancel') {
      await stripe.paymentIntents.cancel(paymentIntentId)
      return true
    }

    console.error('Cannot release payment intent in status', paymentIntent.id, paymentIntent.status)
    return false
  } catch (error) {
    console.error('Failed to release duplicate payment intent:', error)
    return false
  }
}

type PersistClaim =
  | { kind: 'saved'; paymentIntentId: string }
  | { kind: 'use_stored'; paymentIntentId: string }
  | { kind: 'missing' }
  | { kind: 'failed' }

async function claimPaymentIntentId(
  stripe: Stripe,
  serviceId: string,
  paymentIntentId: string,
): Promise<PersistClaim> {
  if (!supabaseServiceKey) {
    return { kind: 'failed' }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from('service')
      .update({ payment_intent_id: paymentIntentId })
      .eq('service_id', serviceId)
      .or(`payment_intent_id.is.null,payment_intent_id.eq.${paymentIntentId}`)
      .select('service_id, payment_intent_id')

    if (error) {
      console.error('Failed to persist payment_intent_id on service:', error)
      continue
    }

    if (data && data.length > 0) {
      return { kind: 'saved', paymentIntentId }
    }

    const { data: row, error: readError } = await supabase
      .from('service')
      .select('service_id, payment_intent_id')
      .eq('service_id', serviceId)
      .maybeSingle()

    if (readError) {
      console.error('Failed to reread service after payment intent persist:', readError)
      continue
    }

    if (!row) {
      return { kind: 'missing' }
    }

    const stored = typeof row.payment_intent_id === 'string' && row.payment_intent_id.length > 0
      ? row.payment_intent_id
      : null
    if (!stored || stored === paymentIntentId) {
      continue
    }

    try {
      const storedIntent = await stripe.paymentIntents.retrieve(stored)
      if (chargeReuseDecision(toSnapshot(storedIntent)) === 'reuse') {
        return { kind: 'use_stored', paymentIntentId: stored }
      }
    } catch (retrieveError) {
      console.error('Failed to retrieve stored payment intent:', retrieveError)
    }

    const { error: overwriteError } = await supabase
      .from('service')
      .update({ payment_intent_id: paymentIntentId })
      .eq('service_id', serviceId)
      .eq('payment_intent_id', stored)

    if (!overwriteError) {
      return { kind: 'saved', paymentIntentId }
    }
    console.error('Failed to replace unusable payment_intent_id:', overwriteError)
  }

  return { kind: 'failed' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let useSavedPaymentMethod = false

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      return jsonResponse({ error: 'Stripe is not configured on the server' }, 500)
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const body = await req.json()
    let amount = body.amount
    const currency = body.currency
    let paymentMethodId = body.payment_method_id
    const serviceId = body.service_id
    const customerId = body.customer_id
    let customerEmail = body.customer_email
    useSavedPaymentMethod = body.use_saved_payment_method === true
    let autofillProviderId: string | null = null
    let storedPaymentIntentId: string | null = null

    if (useSavedPaymentMethod) {
      const resolved = await resolveAutoFillCharge(req, serviceId, customerId)
      if (!resolved.ok) {
        return resolved.response
      }
      amount = resolved.charge.amount
      paymentMethodId = resolved.charge.paymentMethodId
      customerEmail = resolved.charge.email
      autofillProviderId = resolved.charge.providerId
      storedPaymentIntentId = resolved.charge.storedPaymentIntentId
    }

    if (!amount || !paymentMethodId) {
      return jsonResponse({ error: 'Missing required parameters: amount and payment_method_id' }, 400)
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return jsonResponse({ error: 'Amount must be a positive integer (in cents)' }, 400)
    }

    // Resolve customer email: use provided email, or look it up from DB
    let email = customerEmail
    if (!email && customerId && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      const { data } = await supabase
        .from('customer')
        .select('email')
        .eq('customer_id', customerId)
        .maybeSingle()
      email = data?.email ?? null
    }

    if (!email) {
      return jsonResponse({
        error: useSavedPaymentMethod
          ? AUTOFILL_NO_PAYMENT_METHOD
          : 'Unable to resolve customer email. Provide customer_email or a valid customer_id.',
      }, 400)
    }

    console.log('Creating payment intent:', { amount, currency, service_id: serviceId, useSavedPaymentMethod })

    // Find or create a Stripe Customer so the PM can be attached & reused
    const stripeCustomerId = await findOrCreateStripeCustomer(stripe, email)
    console.log('Stripe customer:', stripeCustomerId)

    // Attach the payment method to the customer (idempotent)
    await attachPaymentMethodToCustomer(stripe, paymentMethodId, stripeCustomerId)

    const roundedAmount = Math.round(amount)
    const normalizedCurrency = typeof currency === 'string' && currency ? currency : 'usd'
    const idempotentServiceId = typeof serviceId === 'string' ? idempotencyKeySegment(serviceId) : null

    if (serviceId && !idempotentServiceId) {
      return jsonResponse({ error: 'service_id is not valid for an idempotent charge' }, 400)
    }

    if (!useSavedPaymentMethod && idempotentServiceId && supabaseServiceKey && !storedPaymentIntentId) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      const { data: serviceRow, error: serviceError } = await supabase
        .from('service')
        .select('payment_intent_id')
        .eq('service_id', idempotentServiceId)
        .maybeSingle()
      if (serviceError) {
        console.error('Failed to read service payment_intent_id before charge:', serviceError)
      } else if (typeof serviceRow?.payment_intent_id === 'string' && serviceRow.payment_intent_id.length > 0) {
        storedPaymentIntentId = serviceRow.payment_intent_id
      }
    }

    if (useSavedPaymentMethod && storedPaymentIntentId) {
      try {
        const storedIntent = await stripe.paymentIntents.retrieve(storedPaymentIntentId)
        const action = autofillStoredIntentAction({
          providerId: autofillProviderId ?? '',
          metadataProviderId: storedIntent.metadata?.provider_id ?? null,
          decision: chargeReuseDecision(toSnapshot(storedIntent)),
        })
        if (action === 'conflict') {
          return jsonResponse({ error: AUTOFILL_NOT_OPEN }, 400)
        }
        if (action === 'ignore') {
          storedPaymentIntentId = null
        }
      } catch (retrieveError) {
        console.error('Failed to read stored AutoFill payment intent:', retrieveError)
        storedPaymentIntentId = null
      }
    }

    const chargeParams = {
      amount: roundedAmount,
      currency: normalizedCurrency,
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      confirm: true,
      ...(useSavedPaymentMethod ? { off_session: true } : {}),
      return_url: 'helpr://payment-complete',
      metadata: {
        ...(idempotentServiceId && { service_id: idempotentServiceId }),
        ...(customerId && { customer_id: customerId }),
        charge_path: useSavedPaymentMethod ? 'autofill' : 'confirm',
        ...(useSavedPaymentMethod && autofillProviderId ? { provider_id: autofillProviderId } : {}),
      },
    }

    let paymentIntent: Stripe.PaymentIntent
    try {
      if (idempotentServiceId) {
        const snapshot = await resolveIdempotentPaymentIntent({
          serviceId: idempotentServiceId,
          providerId: autofillProviderId,
          storedPaymentIntentId,
          useSavedPaymentMethod,
          nowUnix: Math.floor(Date.now() / 1000),
          resolver: {
            async retrieve(id) {
              try {
                return toSnapshot(await stripe.paymentIntents.retrieve(id))
              } catch (retrieveError) {
                console.error('Failed to retrieve payment intent:', retrieveError)
                return null
              }
            },
            async searchReusable() {
              let query = `metadata['service_id']:'${idempotentServiceId}' AND status:'succeeded'`
              if (useSavedPaymentMethod) {
                const providerSegment = idempotencyKeySegment(autofillProviderId)
                if (!providerSegment) return null
                query += ` AND metadata['provider_id']:'${providerSegment}'`
              }
              try {
                const result = await stripe.paymentIntents.search({ query, limit: 10 })
                const snapshots = result.data
                  .map(toSnapshot)
                  .filter((snapshot) => {
                    if (useSavedPaymentMethod) {
                      return snapshot.metadataProviderId === autofillProviderId
                    }
                    return snapshot.chargePath !== 'autofill'
                  })
                return pickReusablePaymentIntent(snapshots, roundedAmount)
              } catch (searchError) {
                console.error('PaymentIntent search failed:', searchError)
                return null
              }
            },
            async create(idempotencyKey) {
              try {
                const created = await stripe.paymentIntents.create(chargeParams, { idempotencyKey })
                return toSnapshot(created)
              } catch (createError) {
                throw stripeErrorToCreateError(createError)
              }
            },
          },
        })
        paymentIntent = await stripe.paymentIntents.retrieve(snapshot.id)
      } else {
        // No service id: nothing stable to key. Callers that confirm a job always send one.
        paymentIntent = await stripe.paymentIntents.create(chargeParams)
      }
    } catch (chargeError) {
      console.error('Error creating payment intent:', chargeError)
      const orphanId = chargeError instanceof PaymentIntentCreateError
        ? chargeError.paymentIntentId
        : readStripePaymentIntentId(chargeError)
      if (useSavedPaymentMethod) {
        if (orphanId) {
          try {
            const orphan = await stripe.paymentIntents.retrieve(orphanId)
            // Leave a fresh card decline in place so a concurrent retry reuses it.
            // 3DS and other incomplete off-session attempts cannot be finished by the provider.
            if (
              orphan.status === 'requires_action'
              || orphan.status === 'requires_confirmation'
              || orphan.status === 'requires_capture'
            ) {
              await stripe.paymentIntents.cancel(orphanId)
            }
          } catch (cancelError) {
            console.error('Failed to cancel incomplete AutoFill payment intent:', cancelError)
          }
        }
        return jsonResponse({ error: AUTOFILL_CHARGE_FAILED }, 400)
      }

      const message = chargeError instanceof Error ? chargeError.message : 'Failed to create payment intent'
      return jsonResponse({ error: message }, 400)
    }

    console.log('Payment intent created:', paymentIntent.id, 'status:', paymentIntent.status)

    if (useSavedPaymentMethod && paymentIntent.status !== 'succeeded') {
      console.error('AutoFill payment intent did not succeed:', paymentIntent.id, paymentIntent.status)
      try {
        if (paymentIntent.status !== 'processing') {
          await stripe.paymentIntents.cancel(paymentIntent.id)
        }
      } catch (cancelError) {
        console.error('Failed to cancel incomplete AutoFill payment intent:', cancelError)
      }
      return jsonResponse({ error: AUTOFILL_CHARGE_FAILED }, 400)
    }

    // Normal select-helpr charges persist the id immediately.
    // AutoFill defers that write until the claim update wins, so a losing
    // claim cannot overwrite the winner's payment_intent_id.
    if (!useSavedPaymentMethod && idempotentServiceId) {
      const claim = await claimPaymentIntentId(stripe, idempotentServiceId, paymentIntent.id)
      if (claim.kind === 'use_stored') {
        const choice = preferredPaymentIntentId({
          createdId: paymentIntent.id,
          storedId: claim.paymentIntentId,
          storedReusable: true,
        })
        if (choice.releaseId) {
          const released = await releaseUnattachedPaymentIntent(stripe, choice.releaseId)
          if (!released) {
            console.error('Duplicate payment intent could not be released:', choice.releaseId)
            return jsonResponse({
              error: 'A duplicate charge could not be released. Try again before confirming.',
              paymentIntentId: choice.returnId,
            }, 500)
          }
        }
        paymentIntent = await stripe.paymentIntents.retrieve(choice.returnId)
      } else if (claim.kind === 'missing') {
        const released = await releaseUnattachedPaymentIntent(stripe, paymentIntent.id)
        console.error('Charged a missing service; release', released ? 'succeeded' : 'failed', paymentIntent.id)
        return jsonResponse({
          error: released
            ? 'This job no longer exists, so the charge was reversed.'
            : 'This job no longer exists, and the charge could not be reversed. Contact support before trying again.',
        }, 400)
      } else if (claim.kind === 'failed') {
        console.error('Charge succeeded but payment_intent_id was not saved for', idempotentServiceId, paymentIntent.id)
      } else {
        console.log('Persisted payment_intent_id on service', idempotentServiceId)
      }
    } else if (!useSavedPaymentMethod && serviceId && !supabaseServiceKey) {
      console.error('Cannot persist payment_intent_id: SUPABASE_SERVICE_ROLE_KEY is not set')
    }

    return jsonResponse({
      clientSecret: paymentIntent.client_secret,
      status: paymentIntent.status,
      paymentIntentId: paymentIntent.id,
    }, 200)
  } catch (error) {
    console.error('Error creating payment intent:', error)
    if (useSavedPaymentMethod) {
      return jsonResponse({ error: AUTOFILL_CHARGE_FAILED }, 400)
    }
    const message = error instanceof Error ? error.message : 'Failed to create payment intent'
    return jsonResponse({ error: message }, 400)
  }
})
