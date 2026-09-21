import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import {
  authUserIdsForEmail,
  bookingChargeCents,
  parseBidDollars,
  pickSavedPaymentMethodId,
  readStripePaymentIntentId,
} from '../_shared/autofillPayment.ts'

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
    .select('service_id, customer_id, status, service_provider_id, autofill_type')
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

  return {
    ok: true,
    charge: { amount, paymentMethodId, email },
  }
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

    if (useSavedPaymentMethod) {
      const resolved = await resolveAutoFillCharge(req, serviceId, customerId)
      if (!resolved.ok) {
        return resolved.response
      }
      amount = resolved.charge.amount
      paymentMethodId = resolved.charge.paymentMethodId
      customerEmail = resolved.charge.email
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

    // Confirm server-side so the PM stays attached to the customer context.
    // AutoFill charges off-session: the customer is not present to complete 3DS.
    // If 3DS is required on a customer-present charge, status is requires_action.
    let paymentIntent: Stripe.PaymentIntent
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount),
        currency: currency || 'usd',
        customer: stripeCustomerId,
        payment_method: paymentMethodId,
        confirm: true,
        ...(useSavedPaymentMethod ? { off_session: true } : {}),
        return_url: 'helpr://payment-complete',
        metadata: {
          ...(serviceId && { service_id: serviceId }),
          ...(customerId && { customer_id: customerId }),
          ...(useSavedPaymentMethod ? { charge_path: 'autofill' } : {}),
        },
      })
    } catch (chargeError) {
      console.error('Error creating payment intent:', chargeError)
      if (useSavedPaymentMethod) {
        const orphanId = readStripePaymentIntentId(chargeError)
        if (orphanId) {
          try {
            await stripe.paymentIntents.cancel(orphanId)
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
        await stripe.paymentIntents.cancel(paymentIntent.id)
      } catch (cancelError) {
        console.error('Failed to cancel incomplete AutoFill payment intent:', cancelError)
      }
      return jsonResponse({ error: AUTOFILL_CHARGE_FAILED }, 400)
    }

    // Normal select-helpr charges persist the id immediately.
    // AutoFill defers that write until the claim update wins, so a losing
    // claim cannot overwrite the winner's payment_intent_id.
    if (!useSavedPaymentMethod && serviceId && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      const { error: persistError } = await supabase
        .from('service')
        .update({ payment_intent_id: paymentIntent.id })
        .eq('service_id', serviceId)

      if (persistError) {
        console.error('Failed to persist payment_intent_id on service:', persistError)
      } else {
        console.log('Persisted payment_intent_id on service', serviceId)
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
