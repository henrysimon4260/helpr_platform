// Helpr support Q&A. Secret: OPENAI_API_KEY (not a client env var).
// Deploy notes: README.md in this folder. Contract: JOB_CONTRACT.md.

import {
  completeSupportChat,
  missingKeyBody,
  publicFailureMessage,
  validateSupportRequest,
  type SupportChatErrorBody,
} from './support-bot.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorBody(error: SupportChatErrorBody['error'], message: string): SupportChatErrorBody {
  return { error, message }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json(errorBody('method_not_allowed', 'POST is required.'), 405)
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return json(errorBody('invalid_json', 'Request body must be JSON.'), 400)
  }

  const parsed = validateSupportRequest(payload)
  if (!parsed.ok) {
    return json(errorBody('invalid_request', parsed.message), 400)
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    return json(missingKeyBody('function'), 503)
  }

  try {
    const result = await completeSupportChat(apiKey, parsed.value, fetch)
    return json(result, 200)
  } catch (error) {
    console.error('support-chat failed', error instanceof Error ? error.message : 'unknown')
    return json(errorBody('support_failed', publicFailureMessage(error)), 502)
  }
})
