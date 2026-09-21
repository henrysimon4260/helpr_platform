import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import {
  WEBHOOK_CLAIM_STALE_MS,
  claimAction,
  eventPaymentIntentId,
  metadataServiceId,
  nextPaymentStatus,
  readStripeEvent,
  servicePaymentPatch,
  verifyStripeWebhookSignature,
} from '../_shared/stripeWebhook.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://hecikcopbdhhiilhgmrd.supabase.co'
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function database() {
  return createClient(supabaseUrl, supabaseServiceKey ?? '')
}

type Db = ReturnType<typeof database>

function uniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

function readServiceRow(data: unknown): {
  service_id: string
  payment_intent_id: string | null
  payment_status: string | null
} | null {
  if (!data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  if (typeof row.service_id !== 'string' || row.service_id.length === 0) return null
  return {
    service_id: row.service_id,
    payment_intent_id: typeof row.payment_intent_id === 'string' && row.payment_intent_id.length > 0
      ? row.payment_intent_id
      : null,
    payment_status: typeof row.payment_status === 'string' ? row.payment_status : null,
  }
}

type EventRow = { outcome: string; received_at: string }

function rowClaim(row: EventRow | null, nowMs: number) {
  if (!row) return claimAction(null, nowMs)
  return claimAction({ outcome: row.outcome, receivedAtMs: Date.parse(row.received_at) }, nowMs)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ received: false, error: 'Method not allowed' }, 405)
  }

  const payload = await req.text()
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const verified = await verifyStripeWebhookSignature({
    payload,
    header: req.headers.get('stripe-signature'),
    secret,
    nowUnix: Math.floor(Date.now() / 1000),
  })
  if (!verified.ok) {
    if (verified.reason === 'missing_secret') {
      console.error('Stripe webhook rejected: STRIPE_WEBHOOK_SECRET is not set')
      return jsonResponse({ received: false, error: 'Webhook is not configured' }, 500)
    }
    console.error('Stripe webhook rejected: signature', verified.reason)
    return jsonResponse({ received: false, error: 'Invalid signature' }, 400)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return jsonResponse({ received: false, error: 'Invalid payload' }, 400)
  }

  const event = readStripeEvent(parsed)
  if (!event) {
    return jsonResponse({ received: false, error: 'Invalid event' }, 400)
  }

  if (!supabaseServiceKey) {
    console.error('Stripe webhook rejected: SUPABASE_SERVICE_ROLE_KEY is not set')
    return jsonResponse({ received: false, error: 'Webhook is not configured' }, 500)
  }

  const supabase = database()
  const nowMs = Date.now()

  try {
    const claim = await beginClaim(supabase, event.id, event.type, nowMs)
    if (claim === 'duplicate') {
      return jsonResponse({ received: true, duplicate: true }, 200)
    }
    if (claim === 'retry') {
      return jsonResponse({ received: false, error: 'Event is still processing' }, 500)
    }

    try {
      const applied = await applyEvent(supabase, event)
      const { error: markError } = await supabase
        .from('stripe_webhook_events')
        .update({
          outcome: applied.outcome,
          service_id: applied.serviceId,
          payment_status: applied.paymentStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', event.id)
      if (markError) throw markError
      return jsonResponse({
        received: true,
        duplicate: false,
        outcome: applied.outcome,
        payment_status: applied.paymentStatus,
      }, 200)
    } catch (applyError) {
      console.error('Stripe webhook failed:', event.id, event.type, applyError)
      await supabase
        .from('stripe_webhook_events')
        .update({ outcome: 'error', updated_at: new Date().toISOString() })
        .eq('event_id', event.id)
      return jsonResponse({ received: false, error: 'Failed to process event' }, 500)
    }
  } catch (error) {
    console.error('Stripe webhook claim failed:', event.id, event.type, error)
    return jsonResponse({ received: false, error: 'Failed to process event' }, 500)
  }
})

async function loadClaimRow(
  supabase: Db,
  eventId: string,
): Promise<EventRow | null> {
  const { data, error } = await supabase
    .from('stripe_webhook_events')
    .select('outcome, received_at')
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) throw error
  return data as EventRow | null
}

async function beginClaim(
  supabase: Db,
  eventId: string,
  eventType: string,
  nowMs: number,
): Promise<'process' | 'duplicate' | 'retry'> {
  let row = await loadClaimRow(supabase, eventId)
  let action = rowClaim(row, nowMs)
  if (action === 'duplicate') return 'duplicate'
  if (action === 'retry_later') return 'retry'

  if (action === 'insert') {
    const { error: insertError } = await supabase.from('stripe_webhook_events').insert({
      event_id: eventId,
      event_type: eventType,
      outcome: 'processing',
    })
    if (!insertError) return 'process'
    if (!uniqueViolation(insertError)) throw insertError

    row = await loadClaimRow(supabase, eventId)
    action = rowClaim(row, nowMs)
    if (action === 'duplicate') return 'duplicate'
    if (action === 'retry_later' || action === 'insert') return 'retry'
  }

  if (!row) return 'retry'

  const cutoff = new Date(nowMs - WEBHOOK_CLAIM_STALE_MS).toISOString()
  let takeover = supabase
    .from('stripe_webhook_events')
    .update({
      outcome: 'processing',
      event_type: eventType,
      received_at: new Date(nowMs).toISOString(),
      updated_at: new Date(nowMs).toISOString(),
    })
    .eq('event_id', eventId)

  takeover = row.outcome === 'processing'
    ? takeover.eq('outcome', 'processing').lte('received_at', cutoff)
    : takeover.eq('outcome', 'error')

  const { data: taken, error: takeError } = await takeover.select('event_id')
  if (takeError) throw takeError
  if (!taken || taken.length === 0) return 'retry'
  return 'process'
}

async function applyEvent(
  supabase: Db,
  event: { id: string; type: string; object: Record<string, unknown> },
): Promise<{ outcome: 'processed' | 'ignored'; serviceId: string | null; paymentStatus: string | null }> {
  const paymentIntentId = eventPaymentIntentId(event.type, event.object)
  const serviceIdHint = metadataServiceId(event.object)

  let service: { service_id: string; payment_intent_id: string | null; payment_status: string | null } | null = null
  if (serviceIdHint) {
    const { data, error } = await supabase
      .from('service')
      .select('service_id, payment_intent_id, payment_status')
      .eq('service_id', serviceIdHint)
      .maybeSingle()
    if (error) throw error
    service = readServiceRow(data)
  } else if (paymentIntentId) {
    const { data, error } = await supabase
      .from('service')
      .select('service_id, payment_intent_id, payment_status')
      .eq('payment_intent_id', paymentIntentId)
      .maybeSingle()
    if (error) throw error
    service = readServiceRow(data)
  }

  if (!service) {
    return { outcome: 'ignored', serviceId: null, paymentStatus: null }
  }

  const nextStatus = nextPaymentStatus(event.type, event.object, service.payment_status)
  const patch = servicePaymentPatch({
    nextStatus,
    eventPaymentIntentId: paymentIntentId,
    storedPaymentIntentId: service.payment_intent_id,
  })
  if (!patch) {
    return { outcome: 'ignored', serviceId: service.service_id, paymentStatus: null }
  }

  let update = supabase
    .from('service')
    .update(patch)
    .eq('service_id', service.service_id)
  if (service.payment_intent_id) {
    update = update.eq('payment_intent_id', service.payment_intent_id)
  } else if (patch.payment_intent_id) {
    update = update.is('payment_intent_id', null)
  }

  const { data: written, error: writeError } = await update.select('service_id')
  if (writeError) throw writeError
  if (!written || written.length === 0) {
    return { outcome: 'ignored', serviceId: service.service_id, paymentStatus: null }
  }

  return { outcome: 'processed', serviceId: service.service_id, paymentStatus: patch.payment_status }
}
