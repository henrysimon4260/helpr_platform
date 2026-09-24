export const SUPPORT_MODEL = 'gpt-4o-mini'

export const SUPPORT_INBOX = 'henry@helprservices.co'

export const MAX_MESSAGES = 12
export const MAX_CONTENT_LENGTH = 1500

export const SUPPORT_SYSTEM_PROMPT = `You are Helpr Support, the support assistant for Helpr, a marketplace where customers request home services and independent service providers do the work.

You answer questions about how Helpr works. You cannot look up, change, charge, refund, or message anyone about a specific job. You cannot send email. Never say that you emailed, charged, refunded, cancelled, or updated a booking.

Allowed facts:
- A new customer request is stored with status finding_pros.
- A provider's first non-AutoFill bid moves that job to select_service_provider.
- When the customer selects a provider, or AutoFill assigns one, the job becomes confirmed and that provider is assigned.
- The assigned provider then advances the job from confirmed to helpr_otw (on the way), then in_progress, then completed.
- completed is written by the complete-service process after payment capture. You cannot complete a job from chat.
- pending and scheduled are legacy statuses that may still appear. Do not tell anyone to set them.
- There is no cancelled status and no published cancellation, refund, edit-after-accept, or tax policy in support chat. Do not invent one. Set escalate to true and say a person on the Helpr support team has to follow up.
- The only fees you may state are a 3% payment processing fee and a 1% platform fee on the service price. Do not mention any other percentage, flat fee, tax, tip, or payout formula.
- In-job chat between a customer and a provider is not available here. Do not pretend it exists.
- The support inbox is henry@helprservices.co. You cannot send that email yourself. On the website channel, the visitor can use the contact form on the page. On the app channel, they can email that inbox.

If the user asks for a human, a refund, a cancellation, a specific booking or payment action, taxes, or any policy you were not given, set escalate to true. Say that a person needs to follow up and that this chat has not contacted them yet.

Stay on Helpr support. If the user asks for something unrelated, refuse briefly and invite a Helpr support question.

Reply with JSON only, no markdown: {"reply":"<plain text>","escalate":false}
Keep reply concise. escalate is a boolean.`

const SAFE_REPLY =
  'Helpr support can only confirm a 3% payment processing fee and a 1% platform fee on the service price. Cancellation, refund, and tax rules are not published in this chat. A person on the Helpr support team has to follow up, and this chat has not contacted them.'

const DISALLOWED_REPLY = [
  /2\.9\s*%/,
  /\$\s*0\.30/,
  /\b15\s*%/,
  /\bfull refund\b/i,
  /\brefund within\b/i,
  /\byou can cancel\b/i,
  /\bcancellation fee\b/i,
  /\bnon-refundable\b/i,
  /\bi(?:'ve| have)? (?:emailed|sent this|refunded|cancelled|canceled|charged)\b/i,
]

const ESCALATE_USER =
  /\b(human|real person|representative|live agent|support agent|talk to (?:a |someone|a person|an agent)|refund|cancel(?:lation)?|tax(?:es)?)\b/i

export type SupportAudience = 'customer' | 'provider'
export type SupportChannel = 'app' | 'website'

export type SupportMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type SupportChatRequest = {
  audience: SupportAudience
  channel: SupportChannel
  messages: SupportMessage[]
}

export type SupportChatSuccess = {
  reply: string
  escalate: boolean
}

export type SupportChatErrorCode =
  | 'support_unavailable'
  | 'support_failed'
  | 'invalid_request'
  | 'invalid_json'
  | 'method_not_allowed'

export type SupportChatErrorBody = {
  error: SupportChatErrorCode
  message: string
}

export type FetchLike = (
  input: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    signal?: AbortSignal
  },
) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
  text: () => Promise<string>
}>

export function missingKeyBody(where: 'function' | 'website'): SupportChatErrorBody {
  if (where === 'website') {
    return {
      error: 'support_unavailable',
      message:
        'Support chat is unavailable because OPENAI_API_KEY is not set for the website, and the support-chat function is not configured. Nothing was answered.',
    }
  }

  return {
    error: 'support_unavailable',
    message:
      'Support chat is unavailable because OPENAI_API_KEY is not set on the support-chat function. Nothing was answered.',
  }
}

export function validateSupportRequest(
  input: unknown,
): { ok: true; value: SupportChatRequest } | { ok: false; message: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, message: 'Request body must be a JSON object.' }
  }

  const body = input as Record<string, unknown>
  if (body.audience !== 'customer' && body.audience !== 'provider') {
    return { ok: false, message: 'audience must be customer or provider.' }
  }

  let channel: SupportChannel = 'app'
  if (body.channel !== undefined) {
    if (body.channel !== 'app' && body.channel !== 'website') {
      return { ok: false, message: 'channel must be app or website.' }
    }
    channel = body.channel
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { ok: false, message: 'messages must include at least one message.' }
  }

  if (body.messages.length > MAX_MESSAGES) {
    return { ok: false, message: `messages is limited to ${MAX_MESSAGES} entries.` }
  }

  const messages: SupportMessage[] = []
  for (const entry of body.messages) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, message: 'Each message must be an object.' }
    }
    const role = (entry as { role?: unknown }).role
    const content = (entry as { content?: unknown }).content
    if (role !== 'user' && role !== 'assistant') {
      return { ok: false, message: 'Message role must be user or assistant.' }
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      return { ok: false, message: 'Message content must be non-empty text.' }
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return {
        ok: false,
        message: `Each message is limited to ${MAX_CONTENT_LENGTH} characters.`,
      }
    }
    messages.push({ role, content: content.trim() })
  }

  if (messages[messages.length - 1]?.role !== 'user') {
    return { ok: false, message: 'The latest message must be from the user.' }
  }

  return {
    ok: true,
    value: { audience: body.audience, channel, messages },
  }
}

export function buildChatCompletionBody(request: SupportChatRequest) {
  return {
    model: SUPPORT_MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' as const },
    messages: [
      { role: 'system' as const, content: SUPPORT_SYSTEM_PROMPT },
      {
        role: 'system' as const,
        content: `Audience: ${request.audience}. Channel: ${request.channel}. Support inbox: ${SUPPORT_INBOX}.`,
      },
      ...request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
  }
}

export function guardReply(reply: string, escalate: boolean): SupportChatSuccess {
  if (DISALLOWED_REPLY.some((pattern) => pattern.test(reply))) {
    return { reply: SAFE_REPLY, escalate: true }
  }
  return { reply, escalate }
}

export function interpretModelContent(content: string): SupportChatSuccess {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('invalid_model_json')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('invalid_model_json')
  }

  const reply = (parsed as { reply?: unknown }).reply
  const escalate = (parsed as { escalate?: unknown }).escalate
  if (typeof reply !== 'string' || reply.trim().length === 0) {
    throw new Error('invalid_model_json')
  }

  return guardReply(reply.trim(), escalate === true)
}

function latestUserText(request: SupportChatRequest) {
  for (let index = request.messages.length - 1; index >= 0; index -= 1) {
    const message = request.messages[index]
    if (message?.role === 'user') return message.content
  }
  return ''
}

function readCompletionContent(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return null
  const content = (choices[0] as { message?: { content?: unknown } }).message?.content
  return typeof content === 'string' ? content : null
}

export async function completeSupportChat(
  apiKey: string,
  request: SupportChatRequest,
  fetchImpl: FetchLike,
): Promise<SupportChatSuccess> {
  const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildChatCompletionBody(request)),
    signal: AbortSignal.timeout(20000),
  })

  if (!response.ok) {
    throw new Error(`openai_${response.status}`)
  }

  const content = readCompletionContent(await response.json())
  if (!content) {
    throw new Error('missing_completion')
  }

  const interpreted = interpretModelContent(content)
  if (ESCALATE_USER.test(latestUserText(request))) {
    return { ...interpreted, escalate: true }
  }
  return interpreted
}

export function publicFailureMessage(error: unknown) {
  const code = error instanceof Error ? error.message : ''
  if (code.startsWith('openai_') || code === 'missing_completion' || code === 'invalid_model_json') {
    return 'Support chat could not get a reply from the model. Nothing was answered.'
  }
  return 'Support chat could not get a reply. Nothing was answered.'
}
