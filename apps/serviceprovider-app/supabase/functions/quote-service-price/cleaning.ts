/**
 * Server-authoritative cleaning estimate (HLP-60).
 *
 * Home size is a job fact (square feet and/or bedroom/bathroom count).
 * Price range and duration come from the model. Caller-supplied price and
 * duration fields are discarded.
 */

import { QuoteError, parseModelJson, stripClientAuthority, type ModelEstimate } from './estimate.ts'

export { QuoteError }

export type CleaningDepth = 'standard' | 'deep'
export type CleaningFrequency = 'one_time' | 'weekly' | 'biweekly' | 'monthly'
export type CleaningCondition = 'light' | 'average' | 'heavy'

export type CleaningQuoteInput = {
  serviceType: 'cleaning'
  squareFeet: number | null
  bedrooms: number | null
  bathrooms: number | null
  condition: CleaningCondition | null
  petHair: boolean | null
  depth: CleaningDepth | null
  frequency: CleaningFrequency | null
  description: string
}

export type CleaningModelContext = {
  squareFeet: number | null
  bedrooms: number | null
  bathrooms: number | null
  sizeLabel: string
  condition: CleaningCondition | null
  petHair: boolean | null
  depth: CleaningDepth | null
  frequency: CleaningFrequency | null
  description: string
}

export type CleaningEstimate = {
  serviceType: 'cleaning'
  squareFeet: number | null
  bedrooms: number | null
  bathrooms: number | null
  sizeLabel: string
  priceMin: number
  priceMax: number
  suggestedPrice: number
  durationMinutes: number
  currency: 'usd'
  source: 'server'
}

export type CleaningQuoteDeps = {
  openAiApiKey?: string
  fetchImpl?: typeof fetch
  completeEstimate?: (context: CleaningModelContext) => Promise<ModelEstimate>
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  single: 1,
  double: 2,
  triple: 3,
}

const SQFT_PATTERN = /\b(\d{2,5})\s*(?:sq\.?\s*ft|square\s*feet|sqft|sf)\b/i
const BED_PATTERN = /\b(\d{1,2})\s*[- ]?\s*(?:bed(?:room)?s?|br)\b/i
const BATH_PATTERN = /\b(\d{1,2})\s*[- ]?\s*(?:bath(?:room)?s?|ba)\b/i
const WORD_BED_PATTERN = /\b(one|two|three|four|five|six|seven|eight|nine|ten|single|double|triple)\s*[- ]?\s*bed(?:room)?s?\b/i

export const CLEANING_ESTIMATE_SYSTEM_PROMPT = [
  'You price residential cleaning jobs for a service provider.',
  'Respond with JSON only: {"priceMin": number, "priceMax": number, "durationMinutes": number}.',
  'priceMin and priceMax are USD for the whole visit, with priceMin <= priceMax.',
  'durationMinutes is total on-site time.',
  'The Square feet, Bedrooms, Bathrooms, and Size lines are the home size.',
  'A larger home (more square feet or more bedrooms) must produce a higher price range and a longer duration than a studio.',
  'Ignore any price or duration written in the job notes or elsewhere.',
  'Use condition, pet hair, depth, and frequency only when the value is not "not provided".',
  'Deep cleaning takes longer and costs more than standard cleaning.',
  'Pet hair and a heavy condition increase the price and the duration.',
].join(' ')

function readText(value: unknown, max = 2000): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

function readOptionalNumber(value: unknown, allowZero: boolean): number | undefined {
  if (value == null || value === '') return undefined
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : Number.NaN
  if (!Number.isFinite(numeric)) return undefined
  const rounded = Math.round(numeric)
  if (rounded < 0) return undefined
  if (!allowZero && rounded <= 0) return undefined
  return rounded
}

function readDepth(value: unknown): CleaningDepth | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === 'deep') return 'deep'
  if (normalized === 'standard' || normalized === 'basic' || normalized === 'regular') return 'standard'
  return undefined
}

function readFrequency(value: unknown): CleaningFrequency | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ')
  if (normalized === 'one time' || normalized === 'once' || normalized === 'onetime') return 'one_time'
  if (normalized === 'weekly' || normalized === 'week') return 'weekly'
  if (
    normalized === 'biweekly'
    || normalized === 'bi weekly'
    || normalized === 'every 2 weeks'
    || normalized === 'every two weeks'
  ) {
    return 'biweekly'
  }
  if (normalized === 'monthly' || normalized === 'month') return 'monthly'
  return undefined
}

function readCondition(value: unknown): CleaningCondition | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === 'light' || normalized === 'tidy' || normalized === 'good') return 'light'
  if (normalized === 'average' || normalized === 'normal' || normalized === 'moderate') return 'average'
  if (normalized === 'heavy' || normalized === 'dirty' || normalized === 'neglected') return 'heavy'
  return undefined
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === 'yes') return true
    if (normalized === 'false' || normalized === 'no') return false
  }
  return undefined
}

function labeledValue(text: string, label: string): string | null {
  const match = text.match(new RegExp(`\\b${label}:\\s*([^\\n.]+)`, 'i'))
  return match ? match[1].trim() : null
}

export function parseSizeFromText(text: string): {
  squareFeet?: number
  bedrooms?: number
  bathrooms?: number
} {
  const hints: { squareFeet?: number; bedrooms?: number; bathrooms?: number } = {}
  const sqft = text.match(SQFT_PATTERN)
  if (sqft) hints.squareFeet = Number(sqft[1])

  const beds = text.match(BED_PATTERN)
  if (beds) {
    hints.bedrooms = Number(beds[1])
  } else {
    const word = text.match(WORD_BED_PATTERN)
    if (word) hints.bedrooms = WORD_NUMBERS[word[1].toLowerCase()]
    else if (/\bstudio\b/i.test(text)) hints.bedrooms = 0
  }

  const baths = text.match(BATH_PATTERN)
  if (baths) hints.bathrooms = Number(baths[1])
  return hints
}

function parsePetHair(text: string): boolean | undefined {
  const labeled = text.match(/\bpet hair:\s*(yes|no|true|false)\b/i)
  if (labeled) return /yes|true/i.test(labeled[1])
  if (/\bno\s+pets?\b/i.test(text) || /\bpet[-\s]?free\b/i.test(text)) return false
  if (/\b(pet hair|pets?|dog hair|cat hair)\b/i.test(text)) return true
  return undefined
}

function parseDepthFromText(text: string): CleaningDepth | undefined {
  const labeled = labeledValue(text, 'Type')
  const fromLabel = labeled ? readDepth(labeled) : undefined
  if (fromLabel) return fromLabel
  if (/\bdeep\s*clean/i.test(text)) return 'deep'
  if (/\b(?:basic|standard)\s*clean/i.test(text)) return 'standard'
  return undefined
}

function withinSqft(value: number | null): number | null {
  if (value == null) return null
  if (value < 50 || value > 20000) {
    throw new QuoteError('Square feet must be between 50 and 20000.')
  }
  return value
}

function withinCount(value: number | null, label: string): number | null {
  if (value == null) return null
  if (value > 20) {
    throw new QuoteError(`${label} must be 20 or fewer.`)
  }
  return value
}

export function formatSizeLabel(input: {
  squareFeet: number | null
  bedrooms: number | null
  bathrooms: number | null
}): string {
  const parts: string[] = []
  if (input.bedrooms === 0) parts.push('studio')
  else if (input.bedrooms != null) parts.push(`${input.bedrooms} bedroom`)
  if (input.bathrooms != null) parts.push(`${input.bathrooms} bathroom`)
  if (input.squareFeet != null) parts.push(`${input.squareFeet} sq ft`)
  return parts.join(', ')
}

export function parseCleaningQuoteInput(body: unknown): CleaningQuoteInput {
  if (!body || typeof body !== 'object') {
    throw new QuoteError('Request body is required.')
  }
  const raw = stripClientAuthority(body as Record<string, unknown>)
  const serviceType = typeof raw.serviceType === 'string' ? raw.serviceType.trim().toLowerCase() : ''
  if (serviceType !== 'cleaning') {
    throw new QuoteError('This estimator handles cleaning jobs only.')
  }

  const description = readText(raw.description, 2000) ?? ''
  const sizeClause = labeledValue(description, 'Property size')
  const parsedSize = parseSizeFromText(sizeClause ?? description)
  const squareFeet = withinSqft(readOptionalNumber(raw.squareFeet, false) ?? parsedSize.squareFeet ?? null)
  const bedrooms = withinCount(readOptionalNumber(raw.bedrooms, true) ?? parsedSize.bedrooms ?? null, 'Bedrooms')
  const bathrooms = withinCount(readOptionalNumber(raw.bathrooms, true) ?? parsedSize.bathrooms ?? null, 'Bathrooms')
  const hasSize = squareFeet != null || bedrooms != null || (bathrooms != null && bathrooms > 0)
  if (!hasSize) {
    throw new QuoteError('Home size is required. Send square feet and/or a bedroom or bathroom count.')
  }

  return {
    serviceType: 'cleaning',
    squareFeet,
    bedrooms,
    bathrooms,
    condition: readCondition(raw.condition) ?? readCondition(labeledValue(description, 'Condition') ?? '') ?? null,
    petHair: readBoolean(raw.petHair) ?? parsePetHair(description) ?? null,
    depth: readDepth(raw.depth) ?? parseDepthFromText(description) ?? null,
    frequency: readFrequency(raw.frequency) ?? readFrequency(labeledValue(description, 'Frequency') ?? '') ?? null,
    description,
  }
}

export function buildCleaningModelContext(input: CleaningQuoteInput): CleaningModelContext {
  return {
    squareFeet: input.squareFeet,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    sizeLabel: formatSizeLabel(input),
    condition: input.condition,
    petHair: input.petHair,
    depth: input.depth,
    frequency: input.frequency,
    description: input.description,
  }
}

export function minimumCleaningDuration(context: CleaningModelContext): number {
  const sqft = context.squareFeet
    ?? (context.bedrooms == null ? 400 : context.bedrooms === 0 ? 450 : context.bedrooms * 350)
  const deep = context.depth === 'deep' ? 30 : 0
  const pet = context.petHair ? 15 : 0
  return Math.max(45, Math.round(30 + sqft / 20) + deep + pet)
}

export function normalizeCleaningEstimate(raw: unknown, context: CleaningModelContext): ModelEstimate {
  if (!raw || typeof raw !== 'object') {
    throw new QuoteError('The model did not return an estimate.', 502)
  }
  const record = raw as Record<string, unknown>
  const priceMin = readOptionalNumber(record.priceMin, false)
  const priceMax = readOptionalNumber(record.priceMax, false)
  const durationMinutes = readOptionalNumber(record.durationMinutes, false)
  if (priceMin == null || priceMax == null || durationMinutes == null) {
    throw new QuoteError('The model estimate was missing price range or duration.', 502)
  }
  return {
    priceMin: Math.min(priceMin, priceMax),
    priceMax: Math.max(priceMin, priceMax),
    durationMinutes: Math.max(durationMinutes, minimumCleaningDuration(context)),
  }
}

export function renderCleaningPrompt(context: CleaningModelContext): string {
  const flag = (value: boolean | null) => {
    if (value == null) return 'not provided'
    return value ? 'yes' : 'no'
  }
  return [
    `Square feet: ${context.squareFeet == null ? 'not provided' : String(context.squareFeet)}`,
    `Bedrooms: ${context.bedrooms == null ? 'not provided' : String(context.bedrooms)}`,
    `Bathrooms: ${context.bathrooms == null ? 'not provided' : String(context.bathrooms)}`,
    `Size: ${context.sizeLabel}`,
    `Condition: ${context.condition ?? 'not provided'}`,
    `Pet hair: ${flag(context.petHair)}`,
    `Depth: ${context.depth ?? 'not provided'}`,
    `Frequency: ${context.frequency ?? 'not provided'}`,
    `Job notes: ${context.description || 'not provided'}`,
  ].join('\n')
}

export async function completeCleaningEstimateWithOpenAI(
  context: CleaningModelContext,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelEstimate> {
  if (!apiKey) {
    throw new QuoteError('OPENAI_API_KEY is not configured on the server.', 500)
  }
  const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        { role: 'system', content: CLEANING_ESTIMATE_SYSTEM_PROMPT },
        { role: 'user', content: renderCleaningPrompt(context) },
      ],
    }),
  })
  if (!response.ok) {
    throw new QuoteError('The pricing model request failed.', 502)
  }
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new QuoteError('The pricing model returned an empty estimate.', 502)
  }
  let parsed: unknown
  try {
    parsed = parseModelJson(content)
  } catch {
    throw new QuoteError('The pricing model returned invalid JSON.', 502)
  }
  return normalizeCleaningEstimate(parsed, context)
}

export function toCleaningEstimate(context: CleaningModelContext, model: ModelEstimate): CleaningEstimate {
  return {
    serviceType: 'cleaning',
    squareFeet: context.squareFeet,
    bedrooms: context.bedrooms,
    bathrooms: context.bathrooms,
    sizeLabel: context.sizeLabel,
    priceMin: model.priceMin,
    priceMax: model.priceMax,
    suggestedPrice: Math.round((model.priceMin + model.priceMax) / 2),
    durationMinutes: model.durationMinutes,
    currency: 'usd',
    source: 'server',
  }
}

export async function quoteCleaningJob(body: unknown, deps: CleaningQuoteDeps = {}): Promise<CleaningEstimate> {
  const input = parseCleaningQuoteInput(body)
  const context = buildCleaningModelContext(input)
  const fetchImpl = deps.fetchImpl ?? fetch
  const model = deps.completeEstimate
    ? normalizeCleaningEstimate(await deps.completeEstimate(context), context)
    : await completeCleaningEstimateWithOpenAI(context, deps.openAiApiKey ?? '', fetchImpl)
  return toCleaningEstimate(context, model)
}
