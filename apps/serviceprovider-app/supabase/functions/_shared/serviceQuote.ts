/**
 * Server quote math for quote-service-price.
 * The charged service dollars are this module's output, never a client field.
 * Checkout fees match select-helpr: 3% processing + 1% platform, each rounded
 * to the nearest cent, then the total rounded to the nearest cent.
 */

export const QUOTE_TTL_MS = 24 * 60 * 60 * 1000

const CLEANING_PROMPT =
  'You are a pricing assistant for cleaning services. Respond with a JSON object containing: price (number), needs_clarification (boolean), clarification_prompt (string, only if needs_clarification is true), safety_concern (boolean), safety_message (string, only if safety_concern is true). Analyze the task description and determine if critical details are missing: 1) degree of cleaning needed (light/medium/deep), 2) which rooms or entire home, 3) property size. If any are unclear, set needs_clarification to true and provide a friendly clarification_prompt asking for the missing details. If the request involves hazardous materials, biohazards, or dangerous conditions, set safety_concern to true with an appropriate safety_message. For complete descriptions, provide price in USD (20-250 range). IMPORTANT: Scale prices significantly based on property size - Studio: $20-40 (basic) / $40-80 (deep), 1-bed: $30-50 (basic) / $60-100 (deep), 2-bed: $45-70 (basic) / $90-130 (deep), 3-bed: $60-90 (basic) / $120-170 (deep), 4+ bed or house: $80-130 (basic) / $150-250 (deep). Always increase price proportionally with more bedrooms. Provide competitive, budget-friendly estimates.'

const HOME_IMPROVEMENT_PROMPT =
  'You are a pricing assistant for home improvement services. Respond with a JSON object containing: price (number), needs_clarification (boolean), clarification_prompt (string, only if needs_clarification is true), safety_concern (boolean), safety_message (string, only if safety_concern is true). Analyze the task description and determine if critical details are missing: 1) type of home improvement work (repair/installation/renovation), 2) specific areas or rooms requiring work, 3) scope and complexity of the project. If any are unclear, set needs_clarification to true and provide a friendly clarification_prompt asking for the missing details. If the request involves hazardous materials, biohazards, or dangerous conditions, set safety_concern to true with an appropriate safety_message. For complete descriptions, provide price in USD (20-250 range). IMPORTANT: Scale prices significantly based on scope and complexity of the project - Studio: $20-40 (repair) / $40-80 (renovation), 1-bed: $30-50 (repair) / $60-100 (renovation), 2-bed: $45-70 (repair) / $90-130 (renovation), 3-bed: $60-90 (repair) / $120-170 (renovation), 4+ bed or house: $80-130 (repair) / $150-250 (renovation). Always increase price proportionally with more bedrooms. Provide competitive, budget-friendly estimates.'

const FURNITURE_PROMPT =
  'You are a pricing assistant for furniture assembly services. Respond with a JSON object containing: price (number), needs_clarification (boolean), clarification_prompt (string, only if needs_clarification is true), safety_concern (boolean), safety_message (string, only if safety_concern is true). Analyze the task description and determine if critical details are missing: 1) complexity of assembly (simple/moderate/complex), number of furniture pieces, 2) types of furniture items to assemble, 3) number and size of furniture pieces. If any are unclear, set needs_clarification to true and provide a friendly clarification_prompt asking for the missing details. If the request involves hazardous materials, biohazards, or dangerous conditions, set safety_concern to true with an appropriate safety_message. For complete descriptions, provide price in USD (30-300 range). IMPORTANT: Scale prices based on item complexity and quantity - Small item (chair, small table): $30-60 (simple) / $60-100 (complex), Medium item (desk, bookshelf): $50-90 (simple) / $90-150 (complex), Large item (bed frame, wardrobe): $80-130 (simple) / $130-200 (complex), Multiple items or very large (entertainment center, sectional): $120-180 (simple) / $180-300 (complex). Always increase price proportionally with more items and complexity. Provide competitive, budget-friendly estimates.'

const CUSTOM_PROMPT =
  'You are a pricing assistant for custom service requests. Respond with a JSON object containing: price (number), needs_clarification (boolean), clarification_prompt (string, only if needs_clarification is true), safety_concern (boolean), safety_message (string, only if safety_concern is true). Carefully analyze the task description for the exact scope of work. Use your best judgment to determine if essential details are missing - dynamically adjust what you ask for based on the type of task described. If the description is too vague or missing critical details for that specific type of work, set needs_clarification to true with a clarification_prompt asking for the specific missing information. If the request involves: dangerous activities, illegal activities, licensed professional work (electrical/plumbing/HVAC), hazardous materials, extreme physical risk, or appears priced well above $800, set safety_concern to true. For complete, suitable descriptions, provide price in USD (50-800 range): simple tasks $50-150, medium complexity $150-300, complex tasks $300-800. Provide optimistic, budget-friendly estimates.'

const MOVING_PROMPT =
  'You are a pricing assistant for moving services. Respond with a JSON object containing a price field. Keep prices in USD, realistic, and constrain price between 200 and 1800 for jobs requiring transportation between locations. Ensure that any moving services going from one place to another are at least $200 without truck and at least $350 if truck is needed. Start around these two prices for studio/1BR jobs in close proximity to each other and increase accordingly for larger places. use the following constraints to determine the cost of something. 1 bedroom is 15% more expensive than studio, 2 bedroom is 15% expensive than 1 bed, and so on for all bedroom sizes. Make sure this holds true for every single transaction, such that it is guaranteed that the prices are subject to apartment size. Provide optimistic, budget-friendly estimates and, when in doubt, lean toward the lower end of the acceptable price range. Take the driving distance and time into account when estimating prices - longer distances should cost more. Make sure that there is a significant difference between jobs requiring a moving truck and those not requiring it. Take the size of the apartment and whether the customer requires help packing into consideration. Make extra sure all of these criteria are met.'

export type PricingKind = 'discounted' | 'custom' | 'moving'

const PROFILES: Record<string, { kind: PricingKind; prompt: string }> = {
  cleaning: { kind: 'discounted', prompt: CLEANING_PROMPT },
  'home-improvement': { kind: 'discounted', prompt: HOME_IMPROVEMENT_PROMPT },
  'furniture-assembly': { kind: 'discounted', prompt: FURNITURE_PROMPT },
  // The wall-mounting composer still prices with the cleaning prompt and inserts service_type cleaning.
  'wall-mounting': { kind: 'discounted', prompt: CLEANING_PROMPT },
  customService: { kind: 'custom', prompt: CUSTOM_PROMPT },
  custom: { kind: 'custom', prompt: CUSTOM_PROMPT },
  Moving: { kind: 'moving', prompt: MOVING_PROMPT },
  moving: { kind: 'moving', prompt: MOVING_PROMPT },
}

export type QuoteFingerprint = {
  serviceType: string
  description: string
  startLocation: string
  endLocation: string
  location: string
  needsTruck: boolean
}

export type QuoteRequestInput = {
  serviceType: string
  description: string
  startLocation?: string | null
  endLocation?: string | null
  location?: string | null
  needsTruck?: boolean
}

const OPEN_STATUSES = new Set([
  '',
  'finding_pros',
  'pending',
  'scheduled',
  'select_service_provider',
])

export function pricingKind(serviceType: string): PricingKind | null {
  return PROFILES[serviceType]?.kind ?? null
}

export function systemPromptFor(serviceType: string): string | null {
  return PROFILES[serviceType]?.prompt ?? null
}

export function isMovingService(serviceType: string): boolean {
  return pricingKind(serviceType) === 'moving'
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * The truck flag is taken from the description the row will store.
 * A client boolean cannot mark a truck job as a no-truck price.
 */
export function resolveNeedsTruck(description: string, requested: boolean): boolean {
  if (/moving truck is needed/i.test(description)) return true
  if (/no moving truck needed/i.test(description)) return false
  return requested
}

export function quoteFingerprint(input: QuoteRequestInput): QuoteFingerprint | null {
  const serviceType = input.serviceType.trim()
  if (!pricingKind(serviceType)) return null
  const description = input.description.trim()
  if (!description) return null
  return {
    serviceType,
    description,
    startLocation: text(input.startLocation),
    endLocation: text(input.endLocation),
    location: text(input.location),
    needsTruck: isMovingService(serviceType)
      ? resolveNeedsTruck(description, input.needsTruck === true)
      : false,
  }
}

export function readQuoteRequest(body: unknown): { ok: true; fingerprint: QuoteFingerprint } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Missing quote request' }
  }
  const record = body as Record<string, unknown>
  const serviceType = text(record.service_type)
  if (!pricingKind(serviceType)) {
    return { ok: false, error: 'Unknown service type' }
  }
  const description = text(record.description)
  if (!description) {
    return { ok: false, error: 'Description is required' }
  }
  if (description.length > 8000) {
    return { ok: false, error: 'Description is too long' }
  }
  for (const key of ['start_location', 'end_location', 'location'] as const) {
    if (typeof record[key] === 'string' && record[key].trim().length > 500) {
      return { ok: false, error: 'Location is too long' }
    }
  }
  const fingerprint = quoteFingerprint({
    serviceType,
    description,
    startLocation: text(record.start_location),
    endLocation: text(record.end_location),
    location: text(record.location),
    needsTruck: record.needs_truck === true,
  })
  if (!fingerprint) {
    return { ok: false, error: 'Description is required' }
  }
  return { ok: true, fingerprint }
}

export function buildQuoteUserPrompt(
  fingerprint: QuoteFingerprint,
  driving: { distanceMiles: number; durationMinutes: number } | null,
): string {
  const lines = [
    `Task description: ${fingerprint.description}`,
    `Start location: ${fingerprint.startLocation || 'not provided'}`,
    `End location: ${fingerprint.endLocation || 'not provided'}`,
  ]
  if (fingerprint.location) {
    lines.push(`Location: ${fingerprint.location}`)
  }
  if (isMovingService(fingerprint.serviceType)) {
    lines.push(`Needs truck: ${fingerprint.needsTruck ? 'yes' : 'no'}`)
    if (driving) {
      lines.push(
        `Driving distance: ${driving.distanceMiles.toFixed(2)} miles, Estimated driving time: ${Math.round(driving.durationMinutes)} minutes`,
      )
    } else {
      lines.push('Driving distance: not available')
    }
  }
  return lines.join('\n')
}

export type ModelAssessment =
  | { kind: 'safety'; message: string }
  | { kind: 'clarification'; prompt: string }
  | { kind: 'price'; price: number }
  | { kind: 'invalid' }

export function parseModelAssessment(content: string): ModelAssessment {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { kind: 'invalid' }
  }
  if (!parsed || typeof parsed !== 'object') return { kind: 'invalid' }
  const record = parsed as Record<string, unknown>
  if (record.safety_concern === true && typeof record.safety_message === 'string' && record.safety_message.trim()) {
    return { kind: 'safety', message: record.safety_message.trim() }
  }
  if (
    record.needs_clarification === true
    && typeof record.clarification_prompt === 'string'
    && record.clarification_prompt.trim()
  ) {
    return { kind: 'clarification', prompt: record.clarification_prompt.trim() }
  }
  const price = typeof record.price === 'number' ? record.price : Number(record.price)
  if (!Number.isFinite(price)) return { kind: 'invalid' }
  return { kind: 'price', price }
}

export type BookingFees = {
  processingFee: number
  platformFee: number
  customerTotal: number
  customerTotalCents: number
}

/** Same rounding as select-helpr and PaymentSummaryModal. Not a capture. */
export function quoteBookingFees(priceDollars: number): BookingFees {
  const processingFee = Math.round(priceDollars * 0.03 * 100) / 100
  const platformFee = Math.round(priceDollars * 0.01 * 100) / 100
  const customerTotal = Math.round((priceDollars + processingFee + platformFee) * 100) / 100
  return {
    processingFee,
    platformFee,
    customerTotal,
    customerTotalCents: Math.round(customerTotal * 100),
  }
}

export type DrivingLeg = {
  distanceMiles: number
  durationMinutes: number
}

/**
 * Moving adjustments that used to run in the client after the model call.
 * The short-trip formula runs only for a route the server measured.
 * Truck multiplier still applies after that formula, matching moving.hooks.ts.
 */
export function finalizeServicePrice(input: {
  serviceType: string
  llmPrice: number
  needsTruck: boolean
  driving: DrivingLeg | null
}): { price: number; note: string | null } | null {
  if (!Number.isFinite(input.llmPrice)) return null
  const kind = pricingKind(input.serviceType)
  if (!kind) return null

  let price = input.llmPrice
  let note: string | null = null

  if (kind === 'moving') {
    if (input.driving && input.driving.distanceMiles < 0.5) {
      const baseRate = input.needsTruck ? 350 : 200
      const surcharge = Math.round(input.driving.durationMinutes)
      price = baseRate + surcharge
      note = `Short distance rate: base + $${surcharge} (${Math.round(input.driving.durationMinutes)} min drive)`
    }
    if (input.needsTruck) {
      price = price * 1.6
    }
  } else if (kind === 'discounted') {
    price = price * 0.85
  }

  const rounded = Math.max(0, Math.round(price))
  if (rounded <= 0) return null
  return { price: rounded, note }
}

export function jwtRole(token: string): string | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const decoded = globalThis.atob(padded)
    const json = JSON.parse(decoded) as { role?: unknown }
    return typeof json.role === 'string' ? json.role : null
  } catch {
    return null
  }
}

export function parseBearerToken(header: string | null | undefined): string | null {
  if (typeof header !== 'string') return null
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header)
  if (!match || match[1].length === 0) return null
  return match[1]
}

function normStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase()
}

export type PriceWriteRow = {
  status?: string | null
  serviceProviderId?: string | null
  paymentStatus?: string | null
  price?: number | null
  serviceType?: string | null
  description?: string | null
  startLocation?: string | null
  endLocation?: string | null
  location?: string | null
}

/**
 * Mirrors helpr_private.guard_service_price. A client may store a price only
 * when a live server quote exists for that exact job text, or when confirm
 * copies the assigned provider's fill-request bid.
 */
export function clientMayWriteServicePrice(input: {
  op: 'insert' | 'update'
  next: PriceWriteRow
  previous?: PriceWriteRow | null
  quoteMatches: boolean
  acceptedBidMatches: boolean
}): boolean {
  const nextPrice = input.next.price
  if (input.op === 'insert') {
    if (nextPrice === null || nextPrice === undefined) return true
    return input.quoteMatches
  }

  const previous = input.previous ?? {}
  const priceUnchanged = nextPrice === previous.price
    || (nextPrice == null && previous.price == null)
  const textUnchanged = text(input.next.serviceType) === text(previous.serviceType)
    && text(input.next.description) === text(previous.description)
    && text(input.next.startLocation) === text(previous.startLocation)
    && text(input.next.endLocation) === text(previous.endLocation)
    && text(input.next.location) === text(previous.location)

  if (priceUnchanged && textUnchanged) return true
  if (priceUnchanged && !textUnchanged) return input.quoteMatches

  const previousPaid = ['paid', 'succeeded', 'captured'].includes(normStatus(previous.paymentStatus))
  if (previousPaid) return false

  const previousOpen = OPEN_STATUSES.has(normStatus(previous.status)) && !text(previous.serviceProviderId)
  const confirming = normStatus(input.next.status) === 'confirmed'
    && !text(previous.serviceProviderId)
    && Boolean(text(input.next.serviceProviderId))
    && OPEN_STATUSES.has(normStatus(previous.status))
    && input.acceptedBidMatches

  if (confirming) return true
  if (!previousOpen) return false

  const stillOpen = OPEN_STATUSES.has(normStatus(input.next.status)) && !text(input.next.serviceProviderId)
  return stillOpen && input.quoteMatches
}
