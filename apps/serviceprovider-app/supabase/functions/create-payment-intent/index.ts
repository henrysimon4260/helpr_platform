import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import {
  applySalesTaxToCheckout,
  readDollars,
  salesTaxMetadata,
  serviceTaxAddress,
} from '../_shared/salesTax.ts'

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

    if (!service_id || typeof service_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'service_id is required to calculate sales tax' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Sales tax cannot be calculated because the server is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: service, error: serviceError } = await supabase
      .from('service')
      .select('service_type, price, description, location, start_location, end_location')
      .eq('service_id', service_id)
      .maybeSingle()

    if (serviceError || !service) {
      return new Response(
        JSON.stringify({ error: 'Service not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: fillRequests } = await supabase
      .from('service_fill_request')
      .select('bid')
      .eq('service_id', service_id)

    const serverPricesDollars = [service.price, ...(fillRequests ?? []).map((row) => row.bid)]
      .map((value) => readDollars(value))
      .filter((value): value is number => value !== null && value > 0)

    const taxed = applySalesTaxToCheckout({
      preTaxAmountCents: Math.round(amount),
      serviceType: typeof service.service_type === 'string' ? service.service_type : null,
      description: typeof service.description === 'string' ? service.description : null,
      address: serviceTaxAddress(service),
      serverPricesDollars,
    })

    if (!taxed.ok) {
      return new Response(
        JSON.stringify({ error: taxed.error, code: taxed.code }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const chargeCents = taxed.chargeCents

    // Resolve customer email: use provided email, or look it up from DB
    let email = customer_email
    if (!email && customer_id) {
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

    console.log('Creating payment intent:', {
      preTaxAmountCents: Math.round(amount),
      chargeCents,
      salesTaxCents: taxed.quote.tax_cents,
      jurisdiction: taxed.quote.jurisdiction,
      service_id,
    })

    // Find or create a Stripe Customer so the PM can be attached & reused
    const stripeCustomerId = await findOrCreateStripeCustomer(stripe, email)
    console.log('Stripe customer:', stripeCustomerId)

    // Attach the payment method to the customer (idempotent)
    await attachPaymentMethodToCustomer(stripe, payment_method_id, stripeCustomerId)

    // Confirm server-side so the PM stays attached to the customer context.
    // If 3DS is required, status will be 'requires_action' with a client_secret.
    const paymentIntent = await stripe.paymentIntents.create({
      amount: chargeCents,
      currency: currency || 'usd',
      customer: stripeCustomerId,
      payment_method: payment_method_id,
      confirm: true,
      return_url: 'helpr://payment-complete',
      metadata: {
        service_id,
        ...(customer_id && { customer_id }),
        pre_tax_amount_cents: String(Math.round(amount)),
        charge_amount_cents: String(chargeCents),
        ...salesTaxMetadata(taxed.quote),
      },
    })

    console.log('Payment intent created:', paymentIntent.id, 'status:', paymentIntent.status)

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        status: paymentIntent.status,
        paymentIntentId: paymentIntent.id,
        amount: chargeCents,
        pre_tax_amount_cents: Math.round(amount),
        sales_tax: taxed.quote,
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
