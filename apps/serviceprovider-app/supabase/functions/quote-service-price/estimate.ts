/**
 * Server-authoritative moving estimate (HLP-59).
 *
 * Distance comes from the maps client. Price range and job duration come from
 * the model. Caller-supplied distance and price fields are discarded.
 */

export class QuoteError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'QuoteError'
    this.status = status
  }
}

export type PlaceInput = {
  address?: string
  latitude?: number
  longitude?: number
}

export type MovingQuoteInput = {
  serviceType: 'moving'
  origin: PlaceInput
  destination: PlaceInput
  description: string
  stairs: boolean | null
  elevator: boolean | null
  floor: number | null
  volumeHint: string | null
  weightHint: string | null
  crewSize: number | null
  needsTruck: boolean | null
}

export type DrivingLeg = {
  distanceMeters: number
  durationSeconds: number
}

export type MovingModelContext = {
  distanceMiles: number
  drivingDurationMinutes: number
  originLabel: string
  destinationLabel: string
  description: string
  stairs: boolean | null
  elevator: boolean | null
  floor: number | null
  volumeHint: string | null
  weightHint: string | null
  crewSize: number | null
  needsTruck: boolean | null
}

export type ModelEstimate = {
  priceMin: number
  priceMax: number
  durationMinutes: number
}

export type MovingEstimate = {
  serviceType: 'moving'
  distanceMiles: number
  drivingDurationMinutes: number
  priceMin: number
  priceMax: number
  suggestedPrice: number
  durationMinutes: number
  currency: 'usd'
  source: 'server'
}

export type QuoteDeps = {
  mapsApiKey?: string
  openAiApiKey?: string
  fetchImpl?: typeof fetch
  fetchDrivingLeg?: (origin: string, destination: string) => Promise<DrivingLeg>
  completeEstimate?: (context: MovingModelContext) => Promise<ModelEstimate>
}

const CLIENT_AUTHORITY_FIELDS = [
  'distance',
  'distanceMiles',
  'distanceMeters',
  'distanceKm',
  'duration',
  'durationMinutes',
  'drivingDurationMinutes',
  'price',
  'priceMin',
  'priceMax',
  'suggestedPrice',
  'estimate',
] as const

const METERS_PER_MILE = 1609.344

export function stripClientAuthority(body: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...body }
  for (const field of CLIENT_AUTHORITY_FIELDS) {
    delete next[field]
  }
  return next
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === 'yes') return true
    if (normalized === 'false' || normalized === 'no') return false
  }
  return null
}

function readPositiveInt(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.round(numeric)
}

function readText(value: unknown, max = 240): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

export function extractMovingHints(text: string | null | undefined): {
  stairs?: boolean
  elevator?: boolean
  floor?: number
  volumeHint?: string
  weightHint?: string
  crewSize?: number
} {
  const source = text ?? ''
  if (!source.trim()) return {}

  const hints: {
    stairs?: boolean
    elevator?: boolean
    floor?: number
    volumeHint?: string
    weightHint?: string
    crewSize?: number
  } = {}

  if (/\bno\s+elevator\b/i.test(source)) hints.elevator = false
  else if (/\belevator\b/i.test(source)) hints.elevator = true

  if (/\bno\s+stairs\b/i.test(source)) hints.stairs = false
  else if (/\b(stairs|walk[-\s]?up|no\s+elevator)\b/i.test(source)) hints.stairs = true

  const floorMatch = source.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+floor\b/i)
  if (floorMatch) hints.floor = Number(floorMatch[1])

  const crewMatch = source.match(/\bcrew(?:\s+of)?\s+(\d+)\b/i) ?? source.match(/\b(\d+)\s*(?:person|people|mover)s?\b/i)
  if (crewMatch) hints.crewSize = Number(crewMatch[1])

  const volumeMatch = source.match(/\b(\d+\s*[- ]?\s*bed(?:room)?s?|studio)\b/i)
  if (volumeMatch) hints.volumeHint = volumeMatch[1].replace(/\s+/g, ' ').trim()

  if (/\b(heavy|oversized|piano|safe|weight)\b/i.test(source)) {
    const snippet = source.match(/\b(?:heavy|oversized|piano|safe)[^.]{0,48}/i)
    hints.weightHint = snippet ? snippet[0].trim() : 'heavy items'
  }

  return hints
}

function readPlace(value: unknown, label: string): PlaceInput {
  if (!value || typeof value !== 'object') {
    throw new QuoteError(`${label} is required.`)
  }
  const record = value as Record<string, unknown>
  const address = readText(record.address, 300) ?? undefined
  const latitude = typeof record.latitude === 'number' ? record.latitude : Number.NaN
  const longitude = typeof record.longitude === 'number' ? record.longitude : Number.NaN
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude)
  if (hasCoords && (Math.abs(latitude) > 90 || Math.abs(longitude) > 180)) {
    throw new QuoteError(`${label} coordinates are out of range.`)
  }
  if (!address && !hasCoords) {
    throw new QuoteError(`${label} needs an address or coordinates.`)
  }
  return {
    address,
    latitude: hasCoords ? latitude : undefined,
    longitude: hasCoords ? longitude : undefined,
  }
}

export function parseMovingQuoteInput(body: unknown): MovingQuoteInput {
  if (!body || typeof body !== 'object') {
    throw new QuoteError('Request body is required.')
  }
  const raw = stripClientAuthority(body as Record<string, unknown>)
  const serviceType = typeof raw.serviceType === 'string' ? raw.serviceType.trim().toLowerCase() : ''
  if (serviceType !== 'moving') {
    throw new QuoteError('quote-service-price currently estimates moving jobs only.')
  }

  const description = readText(raw.description, 2000) ?? ''
  const extracted = extractMovingHints(description)
  const explicitVolume = readText(raw.volumeHint)
  const explicitWeight = readText(raw.weightHint)

  return {
    serviceType: 'moving',
    origin: readPlace(raw.origin, 'Origin'),
    destination: readPlace(raw.destination, 'Destination'),
    description,
    stairs: readBoolean(raw.stairs) ?? extracted.stairs ?? null,
    elevator: readBoolean(raw.elevator) ?? extracted.elevator ?? null,
    floor: readPositiveInt(raw.floor) ?? extracted.floor ?? null,
    volumeHint: explicitVolume ?? extracted.volumeHint ?? null,
    weightHint: explicitWeight ?? extracted.weightHint ?? null,
    crewSize: readPositiveInt(raw.crewSize) ?? extracted.crewSize ?? null,
    needsTruck: readBoolean(raw.needsTruck),
  }
}

export function placeQuery(place: PlaceInput): string {
  if (place.latitude != null && place.longitude != null) {
    return `${place.latitude},${place.longitude}`
  }
  if (!place.address) {
    throw new QuoteError('A place needs an address or coordinates.')
  }
  return place.address
}

export function placeLabel(place: PlaceInput): string {
  if (place.address && place.latitude != null && place.longitude != null) {
    return `${place.address} (${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)})`
  }
  return place.address ?? `${place.latitude}, ${place.longitude}`
}

export function milesFromMeters(distanceMeters: number): number {
  return Math.round((distanceMeters / METERS_PER_MILE) * 10) / 10
}

export async function fetchGoogleDrivingLeg(
  origin: string,
  destination: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DrivingLeg> {
  if (!apiKey) {
    throw new QuoteError('GOOGLE_MAPS_API_KEY is not configured on the server.', 500)
  }
  const params = new URLSearchParams({
    origins: origin,
    destinations: destination,
    mode: 'driving',
    units: 'imperial',
    key: apiKey,
  })
  const response = await fetchImpl(`https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`)
  if (!response.ok) {
    throw new QuoteError('Driving distance could not be computed.', 502)
  }
  const data = await response.json() as {
    status?: string
    error_message?: string
    rows?: Array<{ elements?: Array<{ status?: string; distance?: { value?: number }; duration?: { value?: number } }> }>
  }
  if (data.status !== 'OK') {
    throw new QuoteError(data.error_message || 'Driving distance could not be computed.', 502)
  }
  const element = data.rows?.[0]?.elements?.[0]
  if (!element || element.status !== 'OK') {
    throw new QuoteError('No driving route between pickup and drop-off.', 422)
  }
  const distanceMeters = element.distance?.value
  const durationSeconds = element.duration?.value
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) {
    throw new QuoteError('Maps response did not include distance and duration.', 502)
  }
  return {
    distanceMeters: distanceMeters as number,
    durationSeconds: durationSeconds as number,
  }
}

function flag(value: boolean | null): string {
  if (value == null) return 'not provided'
  return value ? 'yes' : 'no'
}

export function renderMovingPrompt(context: MovingModelContext): string {
  return [
    `Distance miles: ${context.distanceMiles.toFixed(1)}`,
    `Driving minutes: ${Math.round(context.drivingDurationMinutes)}`,
    `Origin: ${context.originLabel}`,
    `Destination: ${context.destinationLabel}`,
    `Stairs: ${flag(context.stairs)}`,
    `Elevator: ${flag(context.elevator)}`,
    `Floor: ${context.floor == null ? 'not provided' : String(context.floor)}`,
    `Volume: ${context.volumeHint ?? 'not provided'}`,
    `Weight: ${context.weightHint ?? 'not provided'}`,
    `Crew size: ${context.crewSize == null ? 'not provided' : String(context.crewSize)}`,
    `Truck needed: ${flag(context.needsTruck)}`,
    `Job notes: ${context.description || 'not provided'}`,
  ].join('\n')
}

export const MOVING_ESTIMATE_SYSTEM_PROMPT = [
  'You price residential moving jobs for a service provider.',
  'Respond with JSON only: {"priceMin": number, "priceMax": number, "durationMinutes": number}.',
  'priceMin and priceMax are USD for the whole job (labor, truck, and drive), with priceMin <= priceMax.',
  'durationMinutes is total job time, and it must be at least the driving minutes.',
  'The Distance miles and Driving minutes lines were computed by the server maps API.',
  'Ignore any other distance or price. Longer driving distance must produce a higher price range and a longer duration than a short local move.',
  'Use stairs, elevator, floor, volume, weight, crew size, and truck only when the value is not "not provided".',
].join(' ')

export function buildMovingModelContext(input: MovingQuoteInput, leg: DrivingLeg): MovingModelContext {
  const distanceMiles = milesFromMeters(leg.distanceMeters)
  const drivingDurationMinutes = Math.max(1, Math.round(leg.durationSeconds / 60))
  return {
    distanceMiles,
    drivingDurationMinutes,
    originLabel: placeLabel(input.origin),
    destinationLabel: placeLabel(input.destination),
    description: input.description,
    stairs: input.stairs,
    elevator: input.elevator,
    floor: input.floor,
    volumeHint: input.volumeHint,
    weightHint: input.weightHint,
    crewSize: input.crewSize,
    needsTruck: input.needsTruck,
  }
}

export function normalizeModelEstimate(raw: unknown, drivingDurationMinutes: number): ModelEstimate {
  if (!raw || typeof raw !== 'object') {
    throw new QuoteError('The model did not return an estimate.', 502)
  }
  const record = raw as Record<string, unknown>
  const priceMin = readPositiveInt(record.priceMin)
  const priceMax = readPositiveInt(record.priceMax)
  const durationMinutes = readPositiveInt(record.durationMinutes)
  if (priceMin == null || priceMax == null || durationMinutes == null) {
    throw new QuoteError('The model estimate was missing price range or duration.', 502)
  }
  const low = Math.min(priceMin, priceMax)
  const high = Math.max(priceMin, priceMax)
  const durationFloor = Math.max(1, Math.round(drivingDurationMinutes) + 45)
  return {
    priceMin: low,
    priceMax: high,
    durationMinutes: Math.max(durationMinutes, durationFloor),
  }
}

export function parseModelJson(content: string): unknown {
  const trimmed = content.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  return JSON.parse(fenced ? fenced[1] : trimmed)
}

export async function completeMovingEstimateWithOpenAI(
  context: MovingModelContext,
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
        { role: 'system', content: MOVING_ESTIMATE_SYSTEM_PROMPT },
        { role: 'user', content: renderMovingPrompt(context) },
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
  return normalizeModelEstimate(parsed, context.drivingDurationMinutes)
}

export function toMovingEstimate(context: MovingModelContext, model: ModelEstimate): MovingEstimate {
  return {
    serviceType: 'moving',
    distanceMiles: context.distanceMiles,
    drivingDurationMinutes: context.drivingDurationMinutes,
    priceMin: model.priceMin,
    priceMax: model.priceMax,
    suggestedPrice: Math.round((model.priceMin + model.priceMax) / 2),
    durationMinutes: model.durationMinutes,
    currency: 'usd',
    source: 'server',
  }
}

export async function quoteMovingJob(body: unknown, deps: QuoteDeps = {}): Promise<MovingEstimate> {
  const input = parseMovingQuoteInput(body)
  const fetchImpl = deps.fetchImpl ?? fetch
  const origin = placeQuery(input.origin)
  const destination = placeQuery(input.destination)
  const leg = deps.fetchDrivingLeg
    ? await deps.fetchDrivingLeg(origin, destination)
    : await fetchGoogleDrivingLeg(origin, destination, deps.mapsApiKey ?? '', fetchImpl)
  const context = buildMovingModelContext(input, leg)
  const model = deps.completeEstimate
    ? normalizeModelEstimate(await deps.completeEstimate(context), context.drivingDurationMinutes)
    : await completeMovingEstimateWithOpenAI(context, deps.openAiApiKey ?? '', fetchImpl)
  return toMovingEstimate(context, model)
}
