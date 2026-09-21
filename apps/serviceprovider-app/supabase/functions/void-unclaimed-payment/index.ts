import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import {
  canVoidUnclaimedPayment,
  isAlreadyRefunded,
  unclaimedPaymentRelease,
} from '../_shared/autofillPayment.ts'
import { shouldDeferSameProviderVoid } from '../_shared/paymentIntentIdempotency.ts'

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
      console.error('Cannot void payment: SUPABASE_SERVICE_ROLE_KEY is not set')
      return jsonResponse({ voided: false, error: 'Payment release is not configured on the server' }, 500)
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      return jsonResponse({ voided: false, error: 'Stripe is not configured on the server' }, 500)
    }

    const header = req.headers.get('Authorization') ?? ''
    const jwt = header.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return jsonResponse({ voided: false, error: 'Sign in again before releasing this charge.' }, 401)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt)
    if (userError || !userData.user) {
      console.error('Void payment rejected: caller is not signed in', userError)
      return jsonResponse({ voided: false, error: 'Sign in again before releasing this charge.' }, 401)
    }

    const body = await req.json()
    const paymentIntentId = body.paymentIntentId || body.payment_intent_id
    const serviceId = body.service_id || body.serviceId

    if (typeof paymentIntentId !== 'string' || !paymentIntentId || typeof serviceId !== 'string' || !serviceId) {
      return jsonResponse({ voided: false, error: 'Missing paymentIntentId or service_id' }, 400)
    }

    const { data: service, error: serviceError } = await supabase
      .from('service')
      .select('service_id, status, payment_intent_id, payment_status, service_provider_id')
      .eq('service_id', serviceId)
      .maybeSingle()

    if (serviceError || !service) {
      console.error('Void payment rejected: service missing', serviceError)
      return jsonResponse({ voided: false, error: 'Service not found' }, 404)
    }

    if (!canVoidUnclaimedPayment(service, paymentIntentId)) {
      return jsonResponse({
        voided: false,
        error: 'This charge is already attached to a confirmed job.',
      }, 409)
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
    if (paymentIntent.metadata?.service_id && paymentIntent.metadata.service_id !== serviceId) {
      return jsonResponse({ voided: false, error: 'This charge does not belong to this job.' }, 400)
    }
    if (!paymentIntent.metadata?.service_id) {
      return jsonResponse({ voided: false, error: 'This charge cannot be released automatically.' }, 400)
    }

    if (shouldDeferSameProviderVoid({
      metadataProviderId: paymentIntent.metadata?.provider_id ?? null,
      callerId: userData.user.id,
      serviceProviderId: service.service_provider_id ?? null,
      status: service.status,
      createdUnix: paymentIntent.created,
      nowUnix: Math.floor(Date.now() / 1000),
    })) {
      return jsonResponse({
        voided: false,
        error: 'This charge is still being confirmed.',
      }, 409)
    }

    const release = unclaimedPaymentRelease(paymentIntent.status)
    if (release === 'unsupported') {
      console.error('Void payment unsupported status:', paymentIntent.id, paymentIntent.status)
      return jsonResponse({ voided: false, error: 'This charge could not be released automatically.' }, 409)
    }

    if (release === 'refund') {
      try {
        await stripe.refunds.create({ payment_intent: paymentIntentId })
      } catch (refundError) {
        if (!isAlreadyRefunded(refundError)) {
          console.error('Failed to refund unclaimed payment:', refundError)
          return jsonResponse({ voided: false, error: 'This charge could not be released automatically.' }, 500)
        }
      }
    } else if (release === 'cancel') {
      try {
        await stripe.paymentIntents.cancel(paymentIntentId)
      } catch (cancelError) {
        console.error('Failed to cancel unclaimed payment:', cancelError)
        return jsonResponse({ voided: false, error: 'This charge could not be released automatically.' }, 500)
      }
    }

    if (service.payment_intent_id === paymentIntentId) {
      const { error: clearError } = await supabase
        .from('service')
        .update({ payment_intent_id: null, payment_status: null })
        .eq('service_id', serviceId)
        .eq('payment_intent_id', paymentIntentId)
        .in('status', ['finding_pros', 'pending', 'scheduled', 'select_service_provider'])

      if (clearError) {
        console.error('Refunded unclaimed payment but failed to clear payment_intent_id:', clearError)
      }
    }

    return jsonResponse({ voided: true }, 200)
  } catch (error) {
    console.error('Void unclaimed payment failed:', error)
    return jsonResponse({ voided: false, error: 'This charge could not be released automatically.' }, 500)
  }
})
