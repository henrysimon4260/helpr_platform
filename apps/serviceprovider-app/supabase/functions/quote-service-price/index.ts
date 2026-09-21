import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import {
  QUOTE_TTL_MS,
  buildQuoteUserPrompt,
  finalizeServicePrice,
  isMovingService,
  jwtRole,
  parseBearerToken,
  parseModelAssessment,
  quoteBookingFees,
  readQuoteRequest,
  systemPromptFor,
  type QuoteFingerprint,
} from '../_shared/serviceQuote.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function geocode(address: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', address)
  url.searchParams.set('key', apiKey)
  const response = await fetch(url)
  if (!response.ok) return null
  const data = await response.json()
  const loc = data?.results?.[0]?.geometry?.location
  if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') return null
  return { lat: loc.lat, lng: loc.lng }
}

async function serverDrivingRoute(
  fingerprint: QuoteFingerprint,
  apiKey: string,
): Promise<{ distanceMiles: number; durationMinutes: number } | null> {
  if (!isMovingService(fingerprint.serviceType)) return null
  if (!fingerprint.startLocation || !fingerprint.endLocation) return null
  const origin = await geocode(fingerprint.startLocation, apiKey)
  const destination = await geocode(fingerprint.endLocation, apiKey)
  if (!origin || !destination) return null

  const url = new URL('https://maps.googleapis.com/maps/api/directions/json')
  url.searchParams.set('origin', `${origin.lat},${origin.lng}`)
  url.searchParams.set('destination', `${destination.lat},${destination.lng}`)
  url.searchParams.set('mode', 'driving')
  url.searchParams.set('key', apiKey)
  const response = await fetch(url)
  if (!response.ok) return null
  const data = await response.json()
  const leg = data?.routes?.[0]?.legs?.[0]
  if (typeof leg?.distance?.value !== 'number' || typeof leg?.duration?.value !== 'number') return null
  return {
    distanceMiles: leg.distance.value / 1609.344,
    durationMinutes: leg.duration.value / 60,
  }
}

async function modelContent(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })
  if (!response.ok) {
    console.error('OpenAI quote failed', response.status)
    throw new Error('quote_failed')
  }
  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('quote_failed')
  }
  return content
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  try {
    const token = parseBearerToken(req.headers.get('Authorization'))
    const role = token ? jwtRole(token) : null
    if (!token || (role !== 'anon' && role !== 'authenticated')) {
      return json(401, { error: 'Sign in is required to request a price.' })
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return json(500, { error: 'Price quotes are not configured' })
    }

    let authUserId: string | null = null
    if (role === 'authenticated') {
      if (!supabaseAnonKey) {
        return json(500, { error: 'Price quotes are not configured' })
      }
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const { data, error } = await userClient.auth.getUser(token)
      if (error || !data.user) {
        return json(401, { error: 'Sign in is required to request a price.' })
      }
      authUserId = data.user.id
    }

    const body = await req.json().catch(() => null)
    const parsedRequest = readQuoteRequest(body)
    if (!parsedRequest.ok) {
      return json(400, { error: parsedRequest.error })
    }
    const fingerprint = parsedRequest.fingerprint
    const prompt = systemPromptFor(fingerprint.serviceType)
    if (!prompt) {
      return json(400, { error: 'Unknown service type' })
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey)
    const nowIso = new Date().toISOString()
    const { data: existing, error: existingError } = await admin
      .from('service_price_quote')
      .select('quote_id, price, note, processing_fee, platform_fee, customer_total')
      .eq('service_type', fingerprint.serviceType)
      .eq('description', fingerprint.description)
      .eq('start_location', fingerprint.startLocation)
      .eq('end_location', fingerprint.endLocation)
      .eq('location', fingerprint.location)
      .eq('needs_truck', fingerprint.needsTruck)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingError) {
      console.error('Quote lookup failed', existingError.message)
      return json(500, { error: 'Unable to estimate price right now.' })
    }

    if (existing) {
      const price = Number(existing.price)
      const fees = quoteBookingFees(price)
      return json(200, {
        quote_id: existing.quote_id,
        price,
        note: existing.note ?? null,
        processing_fee: fees.processingFee,
        platform_fee: fees.platformFee,
        customer_total: fees.customerTotal,
        customer_total_cents: fees.customerTotalCents,
      })
    }

    const openAiKey = Deno.env.get('OPENAI_API_KEY') || ''
    if (!openAiKey) {
      return json(500, { error: 'Price quotes are not configured' })
    }

    const mapsKey = Deno.env.get('GOOGLE_MAPS_API_KEY') || Deno.env.get('GOOGLE_PLACES_API_KEY') || ''
    const driving = mapsKey ? await serverDrivingRoute(fingerprint, mapsKey) : null
    const content = await modelContent(prompt, buildQuoteUserPrompt(fingerprint, driving), openAiKey)
    const assessment = parseModelAssessment(content)

    if (assessment.kind === 'safety') {
      return json(200, { safety_concern: true, safety_message: assessment.message })
    }
    if (assessment.kind === 'clarification') {
      return json(200, { needs_clarification: true, clarification_prompt: assessment.prompt })
    }
    if (assessment.kind !== 'price') {
      return json(502, { error: 'Unable to estimate price right now.' })
    }

    const finalized = finalizeServicePrice({
      serviceType: fingerprint.serviceType,
      llmPrice: assessment.price,
      needsTruck: fingerprint.needsTruck,
      driving,
    })
    if (!finalized) {
      return json(502, { error: 'Unable to estimate price right now.' })
    }

    const fees = quoteBookingFees(finalized.price)
    const expiresAt = new Date(Date.now() + QUOTE_TTL_MS).toISOString()
    const { data: inserted, error: insertError } = await admin
      .from('service_price_quote')
      .insert({
        auth_user_id: authUserId,
        service_type: fingerprint.serviceType,
        description: fingerprint.description,
        start_location: fingerprint.startLocation,
        end_location: fingerprint.endLocation,
        location: fingerprint.location,
        needs_truck: fingerprint.needsTruck,
        price: finalized.price,
        note: finalized.note,
        processing_fee: fees.processingFee,
        platform_fee: fees.platformFee,
        customer_total: fees.customerTotal,
        expires_at: expiresAt,
      })
      .select('quote_id')
      .single()

    if (insertError || !inserted) {
      console.error('Quote insert failed', insertError?.message)
      return json(500, { error: 'Unable to estimate price right now.' })
    }

    return json(200, {
      quote_id: inserted.quote_id,
      price: finalized.price,
      note: finalized.note,
      processing_fee: fees.processingFee,
      platform_fee: fees.platformFee,
      customer_total: fees.customerTotal,
      customer_total_cents: fees.customerTotalCents,
    })
  } catch (error) {
    console.error('quote-service-price failed', error instanceof Error ? error.message : 'unknown')
    return json(500, { error: 'Unable to estimate price right now.' })
  }
})
