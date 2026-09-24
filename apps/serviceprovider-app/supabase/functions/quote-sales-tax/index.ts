import { computeSalesTax, readSalesTaxRequest } from '../_shared/salesTax.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(status: number, body: Record<string, unknown>) {
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
    return json(405, { error: 'Method not allowed' })
  }

  try {
    const body = await req.json().catch(() => null)
    const parsed = readSalesTaxRequest(body)
    if (!parsed.ok) {
      return json(400, { error: parsed.error })
    }

    const result = computeSalesTax({
      lines: parsed.lines,
      address: parsed.address,
      description: parsed.description,
    })
    if (!result.ok) {
      const status = result.code === 'unsupported_jurisdiction' ? 422 : 400
      return json(status, { error: result.error, code: result.code })
    }

    return json(200, { ...result.quote })
  } catch (error) {
    console.error('quote-sales-tax failed', error instanceof Error ? error.message : 'unknown')
    return json(500, { error: 'Unable to calculate sales tax.' })
  }
})
