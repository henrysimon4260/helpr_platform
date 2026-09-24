import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { requireUser, serviceClient } from '../_shared/auth.ts'
import { json, corsHeaders } from '../_shared/http.ts'
import {
  cardDeleteDecision,
  IN_FLIGHT_PAID_STATUSES,
  paymentIntentBlocksDetach,
} from '../_shared/paymentPolicy.ts'

const PAYMENT_METHOD_COLUMNS = 'id, user_id, stripe_pm_id, is_default'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const auth = await requireUser(req)
    if ('error' in auth) {
      return json({ success: false, error: auth.error }, 401)
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      return json({ success: false, error: 'Stripe is not configured on the server' }, 500)
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const body = await req.json().catch(() => ({}))
    const requestedId = typeof body?.payment_method_id === 'string' ? body.payment_method_id.trim() : ''
    if (!requestedId) {
      return json({ success: false, error: 'Missing payment_method_id' })
    }

    const admin = serviceClient()
    const userId = auth.user.id

    let lookup = admin
      .from('payment_methods')
      .select(PAYMENT_METHOD_COLUMNS)
      .eq('user_id', userId)

    lookup = requestedId.startsWith('pm_')
      ? lookup.eq('stripe_pm_id', requestedId)
      : lookup.eq('id', requestedId)

    const { data: row, error: rowError } = await lookup.maybeSingle()
    if (rowError) {
      console.error('Failed to load payment method:', rowError)
      return json({
        success: false,
        error: 'Could not verify this payment method. It was not removed.',
      })
    }
    if (!row?.stripe_pm_id) {
      return json({ success: false, error: 'Payment method not found.' })
    }

    const { count, error: countError } = await admin
      .from('payment_methods')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    if (countError || count == null) {
      console.error('Failed to count payment methods:', countError)
      return json({
        success: false,
        error: 'Could not verify your saved cards. Nothing was removed.',
      })
    }

    const customerIds = new Set<string>([userId])
    if (auth.user.email) {
      const { data: customers, error: customerError } = await admin
        .from('customer')
        .select('customer_id')
        .ilike('email', escapeIlike(auth.user.email))

      if (customerError) {
        console.error('Failed to resolve customer:', customerError)
        return json({
          success: false,
          error: 'Could not verify open jobs for this card. It was not removed.',
        })
      }
      for (const customer of customers ?? []) {
        if (customer.customer_id) customerIds.add(customer.customer_id)
      }
    }

    const { data: jobs, error: jobsError } = await admin
      .from('service')
      .select('service_id, payment_intent_id')
      .in('customer_id', [...customerIds])
      .eq('payment_status', 'paid')
      .in('status', [...IN_FLIGHT_PAID_STATUSES])

    if (jobsError) {
      console.error('Failed to load in-flight jobs:', jobsError)
      return json({
        success: false,
        error: 'Could not verify open jobs for this card. It was not removed.',
      })
    }

    let blockingStatus: string | null = null
    for (const job of jobs ?? []) {
      if (!job.payment_intent_id) continue
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(job.payment_intent_id)
        const intentMethodId =
          typeof paymentIntent.payment_method === 'string'
            ? paymentIntent.payment_method
            : paymentIntent.payment_method?.id ?? null
        if (intentMethodId === row.stripe_pm_id && paymentIntentBlocksDetach(paymentIntent.status)) {
          blockingStatus = paymentIntent.status
          break
        }
      } catch (stripeError) {
        console.error('Failed to retrieve payment intent:', stripeError)
        return json({
          success: false,
          error: 'Could not verify whether this card is still needed for an open payment. It was not removed.',
        })
      }
    }

    const decision = cardDeleteDecision({
      savedCardCount: count,
      inFlightPaidJobCount: jobs?.length ?? 0,
      paymentIntentStatus: blockingStatus,
    })
    if (!decision.allowed) {
      return json({ success: false, error: decision.error, code: decision.code })
    }

    try {
      await stripe.paymentMethods.detach(row.stripe_pm_id)
    } catch (stripeError) {
      if (!isAlreadyDetached(stripeError)) {
        console.error('Failed to detach payment method:', stripeError)
        const message = stripeError instanceof Error ? stripeError.message : 'Stripe could not remove this card.'
        return json({ success: false, error: message })
      }
    }

    const { error: deleteError } = await admin
      .from('payment_methods')
      .delete()
      .eq('id', row.id)
      .eq('user_id', userId)

    if (deleteError) {
      console.error('Detached in Stripe but failed to delete row:', deleteError)
      return json({
        success: false,
        error: 'The card was detached in Stripe, but the saved record could not be deleted. Try again.',
        code: 'db_delete_failed',
      })
    }

    if (row.is_default) {
      const { data: next } = await admin
        .from('payment_methods')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (next?.id) {
        const { error: defaultError } = await admin
          .from('payment_methods')
          .update({ is_default: true })
          .eq('id', next.id)
          .eq('user_id', userId)
        if (defaultError) {
          console.error('Failed to promote a new default card:', defaultError)
        }
      }
    }

    return json({ success: true, deleted_id: row.id })
  } catch (error) {
    console.error('delete-payment-method error:', error)
    const message = error instanceof Error ? error.message : 'Failed to remove payment method'
    return json({ success: false, error: message })
  }
})

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&')
}

function isAlreadyDetached(error: unknown): boolean {
  const stripeError = error as { code?: string; message?: string }
  if (stripeError.code === 'resource_missing') return true
  const message = (stripeError.message ?? '').toLowerCase()
  return message.includes('not attached') || message.includes('no such payment_method') || message.includes('no such paymentmethod')
}
