import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { callerOwnsServiceCustomer, parseBearerToken } from '../_shared/chargeAuthorization.ts'
import {
  authorizeRefundCaller,
  readRefundServiceId,
  refundBlockedByPayout,
  refundHttpResult,
  releaseCancelledPayment,
  secretsMatch,
} from '../_shared/cancelledRefund.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://hecikcopbdhhiilhgmrd.supabase.co'
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!supabaseServiceKey) {
      console.error('Refund rejected: SUPABASE_SERVICE_ROLE_KEY is not set')
      return jsonResponse({ released: false, error: 'Refunds are not configured on the server' }, 500)
    }

    const bearer = parseBearerToken(req.headers.get('Authorization'))
    if (!bearer) {
      return jsonResponse({ released: false, error: 'Sign in again before refunding this booking.' }, 401)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const isServiceRole = secretsMatch(bearer, supabaseServiceKey)
    let authUserId: string | null = null
    let authEmail: string | null = null
    if (!isServiceRole) {
      const { data: userData, error: userError } = await supabase.auth.getUser(bearer)
      if (userError || !userData.user) {
        return jsonResponse({ released: false, error: 'Sign in again before refunding this booking.' }, 401)
      }
      authUserId = userData.user.id
      authEmail = userData.user.email ?? null
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ released: false, error: 'Missing service_id' }, 400)
    }

    const serviceId = readRefundServiceId(body)
    if (!serviceId) {
      return jsonResponse({ released: false, error: 'Missing service_id' }, 400)
    }

    const { data: service, error: serviceError } = await supabase
      .from('service')
      .select('service_id, status, payment_intent_id, customer_id')
      .eq('service_id', serviceId)
      .maybeSingle()
    if (serviceError) {
      console.error('Refund rejected: service lookup failed', serviceError)
      return jsonResponse({ released: false, error: 'Refunds are not configured on the server' }, 500)
    }
    if (!service) {
      return jsonResponse({ released: false, error: 'Service not found' }, 404)
    }

    let ownsService = false
    if (!isServiceRole) {
      const { data: customer, error: customerError } = await supabase
        .from('customer')
        .select('email')
        .eq('customer_id', service.customer_id)
        .maybeSingle()
      if (customerError) {
        console.error('Refund rejected: customer lookup failed', customerError)
        return jsonResponse({ released: false, error: 'Refunds are not configured on the server' }, 500)
      }
      ownsService = callerOwnsServiceCustomer({
        authUserId,
        authEmail,
        serviceCustomerId: service.customer_id,
        customerEmail: customer?.email ?? null,
      })
    }

    const authorization = authorizeRefundCaller({
      isServiceRole,
      signedIn: isServiceRole || Boolean(authUserId),
      ownsService,
    })
    if (!authorization.ok) {
      return jsonResponse({ released: false, error: authorization.error }, authorization.status)
    }

    // Status and payment_intent_id come from the row. The body payment_status is never read.
    if ((service.status ?? '').toLowerCase() !== 'cancelled') {
      const skipped = refundHttpResult({ ok: false, reason: 'not_cancelled' })
      return jsonResponse(skipped.body, skipped.httpStatus)
    }
    if (typeof service.payment_intent_id !== 'string' || service.payment_intent_id.length === 0) {
      const skipped = refundHttpResult({ ok: false, reason: 'missing_payment_intent' })
      return jsonResponse(skipped.body, skipped.httpStatus)
    }

    const { data: ledger, error: ledgerError } = await supabase
      .from('platform_transactions')
      .select('stripe_transfer_id')
      .eq('service_id', serviceId)
      .maybeSingle()
    if (ledgerError) {
      console.error('Refund rejected: payout lookup failed', ledgerError)
      return jsonResponse({ released: false, error: 'This charge could not be refunded automatically.' }, 500)
    }
    if (refundBlockedByPayout(ledger?.stripe_transfer_id)) {
      const blocked = refundHttpResult({ ok: false, reason: 'payout_exists' })
      return jsonResponse(blocked.body, blocked.httpStatus)
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      return jsonResponse({ released: false, error: 'Stripe is not configured on the server' }, 500)
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const result = await releaseCancelledPayment({
      paymentIntents: {
        retrieve: (id) => stripe.paymentIntents.retrieve(id),
        cancel: (id, params, options) => stripe.paymentIntents.cancel(id, params, options),
      },
      refunds: {
        create: (params, options) => stripe.refunds.create(params, options),
      },
    }, {
      serviceId,
      serviceStatus: service.status,
      paymentIntentId: service.payment_intent_id,
      payoutTransferId: ledger?.stripe_transfer_id ?? null,
    })

    const http = refundHttpResult(result)
    if (http.writePaymentStatus) {
      const { error: writeError } = await supabase
        .from('service')
        .update({ payment_status: http.writePaymentStatus })
        .eq('service_id', serviceId)
        .eq('status', 'cancelled')
      if (writeError) {
        console.error('Refund moved in Stripe but payment_status was not saved', serviceId, writeError)
        return jsonResponse({ released: false, error: 'This charge could not be refunded automatically.' }, 500)
      }
    }

    console.log('Cancel refund result', serviceId, http.body.action ?? http.body.skipped ?? http.body.error)
    return jsonResponse(http.body, http.httpStatus)
  } catch (error) {
    console.error('Cancel refund failed:', error)
    return jsonResponse({ released: false, error: 'This charge could not be refunded automatically.' }, 500)
  }
})
