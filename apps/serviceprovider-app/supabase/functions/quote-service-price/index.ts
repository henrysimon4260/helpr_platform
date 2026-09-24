import { quoteAssemblyJob } from './assembly.ts'
import { quoteCleaningJob } from './cleaning.ts'
import { QuoteError, quoteMovingJob } from './estimate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'POST a moving, cleaning, or furniture assembly quote.' }, 405)
  }

  try {
    const body = await req.json()
    const serviceType = body && typeof body === 'object' && typeof body.serviceType === 'string'
      ? body.serviceType.trim().toLowerCase().replace(/[\s_-]+/g, '')
      : ''
    const openAiApiKey = Deno.env.get('OPENAI_API_KEY') || ''
    const estimate = serviceType === 'cleaning'
      ? await quoteCleaningJob(body, { openAiApiKey, fetchImpl: fetch })
      : serviceType === 'furnitureassembly' || serviceType === 'assembly'
        ? await quoteAssemblyJob(body, { openAiApiKey, fetchImpl: fetch })
        : await quoteMovingJob(body, {
          mapsApiKey: Deno.env.get('GOOGLE_MAPS_API_KEY') || Deno.env.get('GOOGLE_PLACES_API_KEY') || '',
          openAiApiKey,
          fetchImpl: fetch,
        })
    return json(estimate, 200)
  } catch (error) {
    if (error instanceof QuoteError) {
      return json({ error: error.message }, error.status)
    }
    console.error('quote-service-price failed', error)
    return json({ error: 'Unable to estimate this job right now.' }, 500)
  }
})
