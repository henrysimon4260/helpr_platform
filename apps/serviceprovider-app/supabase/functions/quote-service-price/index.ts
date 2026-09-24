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
    return json({ error: 'POST a moving quote with origin and destination.' }, 405)
  }

  try {
    const body = await req.json()
    const estimate = await quoteMovingJob(body, {
      mapsApiKey: Deno.env.get('GOOGLE_MAPS_API_KEY') || Deno.env.get('GOOGLE_PLACES_API_KEY') || '',
      openAiApiKey: Deno.env.get('OPENAI_API_KEY') || '',
      fetchImpl: fetch,
    })
    return json(estimate, 200)
  } catch (error) {
    if (error instanceof QuoteError) {
      return json({ error: error.message }, error.status)
    }
    console.error('quote-service-price failed', error)
    return json({ error: 'Unable to estimate this move right now.' }, 500)
  }
})
