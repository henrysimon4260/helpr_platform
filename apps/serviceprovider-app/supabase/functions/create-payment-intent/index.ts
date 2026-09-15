import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://hecikcopbdhhiilhgmrd.supabase.co'
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: 'Stripe is not configured on the server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const body = await req.json()
    const {
      amount,
      currency,
      payment_method_id,
      service_id,
      customer_id,
      customer_email,
    } = body

    if (!amount || !payment_method_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: amount and payment_method_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Amount must be a positive integer (in cents)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Resolve customer email: use provided email, or look it up from DB
    let email = customer_email
    if (!email && customer_id && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      const { data } = await supabase
        .from('customer')
        .select('email')
        .eq('customer_id', customer_id)
        .maybeSingle()
      email = data?.email ?? null
    }

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Unable to resolve customer email. Provide customer_email or a valid customer_id.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log('Creating payment intent:', { amount, currency, email, service_id })

    // Find or create a Stripe Customer so the PM can be attached & reused
    const stripeCustomerId = await findOrCreateStripeCustomer(stripe, email)
    console.log('Stripe customer:', stripeCustomerId)

    // Attach the payment method to the customer (idempotent)
    await attachPaymentMethodToCustomer(stripe, payment_method_id, stripeCustomerId)

    // Confirm server-side so the PM stays attached to the customer context.
    // If 3DS is required, status will be 'requires_action' with a client_secret.
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: currency || 'usd',
      customer: stripeCustomerId,
      payment_method: payment_method_id,
      confirm: true,
      return_url: 'helpr://payment-complete',
      metadata: {
        ...(service_id && { service_id }),
        ...(customer_id && { customer_id }),
      },
    })

    console.log('Payment intent created:', paymentIntent.id, 'status:', paymentIntent.status)

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        status: paymentIntent.status,
        paymentIntentId: paymentIntent.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('Error creating payment intent:', error)
    const message = error instanceof Error ? error.message : 'Failed to create payment intent'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
