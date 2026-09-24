/**
 * NY sales tax by job type. Single source of truth for quote and checkout.
 *
 * Taxability matrix (Helpr Platform KB, Flynn, HLP-58). Do not add exemptions.
 *
 * | Job type                         | Taxable?                          |
 * | cleaning                         | yes                               |
 * | furniture-assembly               | yes (includes disassemble/reassemble) |
 * | wall-mounting                    | yes                               |
 * | home-improvement                 | yes                               |
 * | moving                           | no, pure transport only           |
 * | custom / mixed / unknown         | unbundle, otherwise taxable       |
 *
 * Mixed carts with separate amounts tax only the taxable lines.
 * Assembly, cleaning, wall mounting, or packing-as-service bundled under a
 * moving SKU without its own amount is fail-closed: the inseparable share is
 * taxed. That path never returns a quiet zero.
 *
 * Rates are parts per 100,000 (8.875% = 8875) so the combined figure is the
 * sum of named components, not a bare literal.
 *
 *   NYC:        4% state + 4.5% city + 0.375% MCTD = 8.875%
 *               (NYC311; NYS Publication 718, New York City 8 7/8)
 *   Yonkers:    4% state + 4.5% local + 0.375% MCTD = 8.875%
 *               (Publication 718, Yonkers 8 7/8)
 *   Westchester: 4% state + 4% local + 0.375% MCTD = 8.375%
 *               (Publication 718, Westchester except Yonkers)
 *
 * NJ destination tax is out of scope. Other states are rejected.
 * The 3% processing fee and 1% platform fee are not part of the taxable base
 * and are not recalculated here.
 */

export const RATE_SCALE = 100_000

/** 4.000% New York State sales tax. */
export const NY_STATE_RATE_PARTS = 4_000
/** 0.375% Metropolitan Commuter Transportation District surcharge. */
export const MCTD_RATE_PARTS = 375
/** 4.500% New York City local sales tax. */
export const NYC_LOCAL_RATE_PARTS = 4_500
/** 4.500% Yonkers local rate (Publication 718 combined 8.875% with state + MCTD). */
export const YONKERS_LOCAL_RATE_PARTS = 4_500
/** 4.000% Westchester County local rate (Publication 718 combined 8.375%). */
export const WESTCHESTER_LOCAL_RATE_PARTS = 4_000

export const NYC_COMBINED_RATE_PARTS =
  NY_STATE_RATE_PARTS + NYC_LOCAL_RATE_PARTS + MCTD_RATE_PARTS
export const YONKERS_COMBINED_RATE_PARTS =
  NY_STATE_RATE_PARTS + YONKERS_LOCAL_RATE_PARTS + MCTD_RATE_PARTS
export const WESTCHESTER_COMBINED_RATE_PARTS =
  NY_STATE_RATE_PARTS + WESTCHESTER_LOCAL_RATE_PARTS + MCTD_RATE_PARTS

/**
 * Existing customer checkout fees. Used only to recognize the pre-tax total
 * select-helpr already sends. Not applied to the taxable base, and not changed.
 */
export const CHECKOUT_PROCESSING_FEE_RATE = 0.03
export const CHECKOUT_PLATFORM_FEE_RATE = 0.01

export const TAXABILITY = {
  cleaning: 'taxable',
  'furniture-assembly': 'taxable',
  'wall-mounting': 'taxable',
  'home-improvement': 'taxable',
  moving: 'nontaxable',
  custom: 'default_taxable',
  unknown: 'default_taxable',
} as const

export type ServiceTypeCode = keyof typeof TAXABILITY
export type Taxability = (typeof TAXABILITY)[ServiceTypeCode]

export type SalesTaxLineInput = {
  serviceType: string
  amountCents: number
  description?: string | null
}

export type SalesTaxLine = {
  service_type_code: string
  service_type: string
  description: string | null
  amount_cents: number
  taxable: boolean
  taxable_base_cents: number
  nontaxable_base_cents: number
  tax_cents: number
  fail_closed: boolean
  reason: string
}

export type SalesTaxRate = {
  state_parts: number
  local_parts: number
  mctd_parts: number
  combined_parts: number
  combined_rate: string
  label: string
}

export type SalesTaxQuote = {
  currency: 'usd'
  jurisdiction: string
  rate_fallback: boolean
  out_of_scope: boolean
  rate: SalesTaxRate
  line_items: SalesTaxLine[]
  taxable_base_cents: number
  nontaxable_base_cents: number
  tax_cents: number
  job_type_codes: string[]
  fail_closed: boolean
  resolution: 'unbundled' | 'single_type' | 'fail_closed_taxable_share' | 'out_of_scope'
}

export type SalesTaxResult =
  | { ok: true; quote: SalesTaxQuote }
  | { ok: false; error: string; code: 'invalid_amount' | 'unsupported_jurisdiction' | 'empty_cart' }

type RateSpec = {
  id: string
  label: string
  stateParts: number
  localParts: number
  mctdParts: number
}

const NYC_RATE: RateSpec = {
  id: 'nyc',
  label: 'New York City (4% state + 4.5% local + 0.375% MCTD)',
  stateParts: NY_STATE_RATE_PARTS,
  localParts: NYC_LOCAL_RATE_PARTS,
  mctdParts: MCTD_RATE_PARTS,
}

const YONKERS_RATE: RateSpec = {
  id: 'yonkers',
  label: 'Yonkers (4% state + 4.5% local + 0.375% MCTD)',
  stateParts: NY_STATE_RATE_PARTS,
  localParts: YONKERS_LOCAL_RATE_PARTS,
  mctdParts: MCTD_RATE_PARTS,
}

const WESTCHESTER_RATE: RateSpec = {
  id: 'westchester',
  label: 'Westchester County (4% state + 4% local + 0.375% MCTD)',
  stateParts: NY_STATE_RATE_PARTS,
  localParts: WESTCHESTER_LOCAL_RATE_PARTS,
  mctdParts: MCTD_RATE_PARTS,
}

const NYS_LAUNCH_RATE: RateSpec = {
  id: 'nys',
  label: 'New York State outside New York City (launch default uses the Westchester combined rate)',
  stateParts: NY_STATE_RATE_PARTS,
  localParts: WESTCHESTER_LOCAL_RATE_PARTS,
  mctdParts: MCTD_RATE_PARTS,
}

const ZERO_RATE: SalesTaxRate = {
  state_parts: 0,
  local_parts: 0,
  mctd_parts: 0,
  combined_parts: 0,
  combined_rate: '0.00000',
  label: 'New Jersey destination sales tax is out of scope',
}

const ALIASES: Record<string, ServiceTypeCode> = {
  cleaning: 'cleaning',
  homecleaning: 'cleaning',
  residentialcleaning: 'cleaning',
  housecleaning: 'cleaning',
  furnitureassembly: 'furniture-assembly',
  assembly: 'furniture-assembly',
  furniture: 'furniture-assembly',
  disassembly: 'furniture-assembly',
  reassembly: 'furniture-assembly',
  disassemble: 'furniture-assembly',
  reassemble: 'furniture-assembly',
  wallmounting: 'wall-mounting',
  wallmount: 'wall-mounting',
  mounting: 'wall-mounting',
  hanging: 'wall-mounting',
  wallhanging: 'wall-mounting',
  homeimprovement: 'home-improvement',
  improvement: 'home-improvement',
  moving: 'moving',
  move: 'moving',
  customservice: 'custom',
  custom: 'custom',
}

const WESTCHESTER_PLACES = [
  'westchester',
  'mount vernon',
  'new rochelle',
  'white plains',
  'peekskill',
  'scarsdale',
  'harrison',
  'mamaroneck',
  'larchmont',
  'bronxville',
  'eastchester',
  'tuckahoe',
  'dobbs ferry',
  'tarrytown',
  'ossining',
  'croton-on-hudson',
  'croton on hudson',
  'hastings-on-hudson',
  'hastings on hudson',
  'irvington',
  'pelham',
  'port chester',
  'mount kisco',
  'bedford',
  'armonk',
  'chappaqua',
  'katonah',
  'pleasantville',
  'yorktown',
  'cortlandt',
  'greenburgh',
  'new castle',
  'north salem',
  'pound ridge',
  'lewisboro',
  'somers',
  'elmsford',
  'ardsley',
  'hartsdale',
  'valhalla',
  'thornwood',
  'hawthorne',
  'rye brook',
  'purchase',
  'rye',
]

const OTHER_STATE_NAMES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
  'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
  'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
  'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
  'new hampshire', 'new mexico', 'north carolina', 'north dakota',
  'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island',
  'south carolina', 'south dakota', 'tennessee', 'texas', 'utah',
  'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin',
  'wyoming', 'district of columbia',
]

function compactKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

export function normalizeServiceType(raw: string | null | undefined): ServiceTypeCode {
  if (!raw || !raw.trim()) return 'unknown'
  const key = compactKey(raw)
  const alias = ALIASES[key]
  if (alias) return alias

  const hasMove = /\bmov(?:e|ing)\b/i.test(raw)
  const hasAssembly = /\b(?:disassembl|reassembl|assembl)/i.test(raw)
  const hasWall = /\bwall[\s-]?mount/i.test(raw)
  const hasClean = /\bclean(?:ing)?\b/i.test(raw)
  if ((hasAssembly || hasWall || hasClean) && !hasMove) {
    if (hasWall) return 'wall-mounting'
    if (hasAssembly) return 'furniture-assembly'
    return 'cleaning'
  }
  return 'unknown'
}

export function bundledTaxableCodes(text: string | null | undefined): ServiceTypeCode[] {
  if (!text) return []
  const codes: ServiceTypeCode[] = []
  if (/\b(?:disassembl|reassembl|assembl)/i.test(text)) codes.push('furniture-assembly')
  if (/\bwall[\s-]?mount|\btv[\s-]?mount|\bmounting\b/i.test(text)) codes.push('wall-mounting')
  if (/\bcleaning\b|\bclean(?:\s+(?:the|my|our|apartment|home|house))\b/i.test(text)) {
    codes.push('cleaning')
  }
  const packingRequested = /\b(?:need help packing|help packing|packing service|pack(?:ing)? my|please pack)\b/i.test(text)
  const alreadyPacked = /\b(?:already packed|items are packed|everything is packed)\b/i.test(text)
  if (packingRequested && !alreadyPacked) codes.push('custom')
  return [...new Set(codes)]
}

function rateFromSpec(spec: RateSpec): SalesTaxRate {
  const combined = spec.stateParts + spec.localParts + spec.mctdParts
  return {
    state_parts: spec.stateParts,
    local_parts: spec.localParts,
    mctd_parts: spec.mctdParts,
    combined_parts: combined,
    combined_rate: (combined / RATE_SCALE).toFixed(5),
    label: spec.label,
  }
}

type ResolvedJurisdiction = {
  id: string
  rate: SalesTaxRate
  rateFallback: boolean
  outOfScope: boolean
  unsupported: boolean
}

function includesPlace(address: string, place: string): boolean {
  const escaped = place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(address)
}

function isNewYorkState(address: string): boolean {
  return /\bnew york\b/i.test(address)
    || /\b,\s*ny\b/i.test(address)
    || /\bny\s+\d{5}\b/i.test(address)
}

export function resolveJurisdiction(address: string | null | undefined): ResolvedJurisdiction {
  const text = (address ?? '').trim()
  if (!text) {
    return {
      id: 'unresolved',
      rate: rateFromSpec(NYC_RATE),
      rateFallback: true,
      outOfScope: false,
      unsupported: false,
    }
  }

  if (/\bnew jersey\b/i.test(text) || /\bnj\b/i.test(text)) {
    return {
      id: 'nj_out_of_scope',
      rate: ZERO_RATE,
      rateFallback: false,
      outOfScope: true,
      unsupported: false,
    }
  }

  const inNewYork = isNewYorkState(text)

  if (inNewYork && includesPlace(text, 'yonkers')) {
    return { id: 'yonkers', rate: rateFromSpec(YONKERS_RATE), rateFallback: false, outOfScope: false, unsupported: false }
  }

  if (inNewYork && WESTCHESTER_PLACES.some((place) => includesPlace(text, place))) {
    return {
      id: 'westchester',
      rate: rateFromSpec(WESTCHESTER_RATE),
      rateFallback: false,
      outOfScope: false,
      unsupported: false,
    }
  }

  const nyc = /\b(?:new york city|nyc|manhattan|brooklyn|queens|bronx|staten island)\b/i.test(text)
    || /\bnew york,\s*(?:ny|new york)\b/i.test(text)
  if (nyc) {
    return { id: 'nyc', rate: rateFromSpec(NYC_RATE), rateFallback: false, outOfScope: false, unsupported: false }
  }

  const newYorkState = /\bnew york\b/i.test(text) || /\b,\s*ny\b/i.test(text) || /\bny\s+\d{5}\b/i.test(text)
  if (newYorkState) {
    return {
      id: 'nys',
      rate: rateFromSpec(NYS_LAUNCH_RATE),
      rateFallback: true,
      outOfScope: false,
      unsupported: false,
    }
  }

  const otherState = OTHER_STATE_NAMES.some((name) => includesPlace(text, name))
    || /\b,\s*(?:A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVT]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY])\s+\d{5}\b/i.test(text)
  if (otherState) {
    return {
      id: 'unsupported',
      rate: ZERO_RATE,
      rateFallback: false,
      outOfScope: false,
      unsupported: true,
    }
  }

  return {
    id: 'unresolved',
    rate: rateFromSpec(NYC_RATE),
    rateFallback: true,
    outOfScope: false,
    unsupported: false,
  }
}

/** Nearest cent. 0.5 cents rounds up, matching NY sales-tax rounding for positive amounts. */
export function taxCentsForBase(taxableBaseCents: number, combinedParts: number): number {
  if (!Number.isInteger(taxableBaseCents) || taxableBaseCents <= 0) return 0
  if (!Number.isInteger(combinedParts) || combinedParts <= 0) return 0
  return Math.round((taxableBaseCents * combinedParts) / RATE_SCALE)
}

function assertCents(amountCents: number): boolean {
  return Number.isInteger(amountCents) && amountCents > 0 && Number.isSafeInteger(amountCents)
}

export function computeSalesTax(input: {
  lines: SalesTaxLineInput[]
  address?: string | null
  description?: string | null
}): SalesTaxResult {
  if (!input.lines.length) {
    return { ok: false, error: 'At least one service line is required to calculate sales tax.', code: 'empty_cart' }
  }
  for (const line of input.lines) {
    if (!line.serviceType || !line.serviceType.trim()) {
      return { ok: false, error: 'Each line needs a service type.', code: 'invalid_amount' }
    }
    if (!assertCents(line.amountCents)) {
      return { ok: false, error: 'Each line amount must be a positive integer number of cents.', code: 'invalid_amount' }
    }
  }

  const jurisdiction = resolveJurisdiction(input.address)
  if (jurisdiction.unsupported) {
    return {
      ok: false,
      error: 'Sales tax for this address is outside the New York launch jurisdiction.',
      code: 'unsupported_jurisdiction',
    }
  }

  const normalized = input.lines.map((line) => ({
    raw: line.serviceType,
    code: normalizeServiceType(line.serviceType),
    amountCents: line.amountCents,
    description: line.description ?? null,
  }))
  const separateTaxable = normalized.some((line) => {
    const kind = TAXABILITY[line.code]
    return kind === 'taxable' || kind === 'default_taxable'
  })

  const draft = normalized.map((line) => {
    const scanned = [line.raw, line.description, input.description].filter(Boolean).join(' ')
    const bundledCodes = line.code === 'moving' && !separateTaxable
      ? bundledTaxableCodes(scanned)
      : []
    const failClosed = bundledCodes.length > 0
    const kind = TAXABILITY[line.code]
    const taxable = jurisdiction.outOfScope
      ? kind !== 'nontaxable' || failClosed
      : failClosed || kind === 'taxable' || kind === 'default_taxable'
    let reason = 'pure_moving'
    if (jurisdiction.outOfScope && taxable) reason = 'jurisdiction_out_of_scope'
    else if (failClosed) reason = 'taxable_work_bundled_under_moving'
    else if (kind === 'taxable') reason = 'taxable_service'
    else if (kind === 'default_taxable') reason = 'custom_or_unknown_default_taxable'

    const taxableBase = taxable && !jurisdiction.outOfScope ? line.amountCents : 0
    const taxCents = taxCentsForBase(taxableBase, jurisdiction.rate.combined_parts)
    return {
      line,
      bundledCodes,
      failClosed,
      taxable: taxable && !jurisdiction.outOfScope,
      taxableBase,
      taxCents,
      reason,
      matrixTaxable: kind !== 'nontaxable' || failClosed,
    }
  })

  const lineItems: SalesTaxLine[] = draft.map((item) => ({
    service_type_code: item.line.code,
    service_type: item.line.raw,
    description: item.line.description,
    amount_cents: item.line.amountCents,
    taxable: item.taxable,
    taxable_base_cents: item.taxableBase,
    nontaxable_base_cents: item.line.amountCents - item.taxableBase,
    tax_cents: item.taxCents,
    fail_closed: item.failClosed,
    reason: item.reason,
  }))

  const taxableBaseCents = lineItems.reduce((sum, line) => sum + line.taxable_base_cents, 0)
  const nontaxableBaseCents = lineItems.reduce((sum, line) => sum + line.nontaxable_base_cents, 0)
  const taxCents = lineItems.reduce((sum, line) => sum + line.tax_cents, 0)
  const failClosed = draft.some((item) => item.failClosed)

  const codes: string[] = []
  for (const item of draft) {
    codes.push(item.line.code)
    if (item.failClosed) codes.push(...item.bundledCodes)
  }
  const jobTypeCodes = [...new Set(codes)]

  let resolution: SalesTaxQuote['resolution'] = 'single_type'
  if (jurisdiction.outOfScope) resolution = 'out_of_scope'
  else if (failClosed) resolution = 'fail_closed_taxable_share'
  else if (lineItems.length > 1) resolution = 'unbundled'

  return {
    ok: true,
    quote: {
      currency: 'usd',
      jurisdiction: jurisdiction.id,
      rate_fallback: jurisdiction.rateFallback,
      out_of_scope: jurisdiction.outOfScope,
      rate: jurisdiction.rate,
      line_items: lineItems,
      taxable_base_cents: taxableBaseCents,
      nontaxable_base_cents: nontaxableBaseCents,
      tax_cents: taxCents,
      job_type_codes: jobTypeCodes,
      fail_closed: failClosed,
      resolution,
    },
  }
}

export function salesTaxMetadata(quote: SalesTaxQuote): Record<string, string> {
  const lines = quote.line_items.map((line) => ({
    code: line.service_type_code,
    amount: line.amount_cents,
    taxable_base: line.taxable_base_cents,
    tax: line.tax_cents,
    fail_closed: line.fail_closed,
  }))
  let linesJson = JSON.stringify(lines)
  if (linesJson.length > 450) linesJson = `${linesJson.slice(0, 447)}...`

  let jobTypes = quote.job_type_codes.join(',')
  if (jobTypes.length > 450) jobTypes = `${jobTypes.slice(0, 447)}...`

  return {
    sales_tax_cents: String(quote.tax_cents),
    taxable_base_cents: String(quote.taxable_base_cents),
    nontaxable_base_cents: String(quote.nontaxable_base_cents),
    job_type_codes: jobTypes,
    sales_tax_jurisdiction: quote.jurisdiction,
    sales_tax_rate_parts: String(quote.rate.combined_parts),
    sales_tax_fail_closed: quote.fail_closed ? 'true' : 'false',
    sales_tax_resolution: quote.resolution,
    sales_tax_lines: linesJson,
  }
}

/** Pre-tax cents the customer app sends today: price + 3% + 1%, each step rounded to the cent. */
export function preTaxCheckoutCents(basePriceDollars: number): number | null {
  if (!Number.isFinite(basePriceDollars) || basePriceDollars <= 0) return null
  const processingFee = Math.round(basePriceDollars * CHECKOUT_PROCESSING_FEE_RATE * 100) / 100
  const platformFee = Math.round(basePriceDollars * CHECKOUT_PLATFORM_FEE_RATE * 100) / 100
  const totalAmount = Math.round((basePriceDollars + processingFee + platformFee) * 100) / 100
  const cents = Math.round(totalAmount * 100)
  if (!Number.isInteger(cents) || cents <= 0) return null
  return cents
}

export function readDollars(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function serviceTaxAddress(service: {
  service_type?: string | null
  location?: string | null
  start_location?: string | null
  end_location?: string | null
}): string {
  const moving = normalizeServiceType(service.service_type) === 'moving'
  if (moving) {
    return service.start_location || service.location || service.end_location || ''
  }
  return service.location || service.start_location || service.end_location || ''
}

export type CheckoutTaxResult =
  | { ok: true; baseCents: number; chargeCents: number; quote: SalesTaxQuote }
  | { ok: false; error: string; code: string }

/**
 * Checkout tax. The taxable base is a price stored on the service or its
 * fill-request bids, recognized by the pre-tax total the app already sends.
 * Client-supplied tax figures are ignored. Fees stay on that pre-tax total;
 * sales tax is added beside them.
 */
export function applySalesTaxToCheckout(input: {
  preTaxAmountCents: number
  serviceType: string | null
  description?: string | null
  address?: string | null
  serverPricesDollars: number[]
}): CheckoutTaxResult {
  if (!Number.isInteger(input.preTaxAmountCents) || input.preTaxAmountCents <= 0) {
    return { ok: false, error: 'Amount must be a positive integer (in cents).', code: 'invalid_amount' }
  }

  const bases = new Set<number>()
  for (const dollars of input.serverPricesDollars) {
    if (!Number.isFinite(dollars) || dollars <= 0) continue
    if (preTaxCheckoutCents(dollars) !== input.preTaxAmountCents) continue
    const cents = Math.round(dollars * 100)
    if (Number.isInteger(cents) && cents > 0) bases.add(cents)
  }
  if (bases.size !== 1) {
    return {
      ok: false,
      error: 'Cannot calculate sales tax because the checkout total does not match a server-side service price.',
      code: bases.size === 0 ? 'checkout_base_unmatched' : 'checkout_base_ambiguous',
    }
  }
  const baseCents = [...bases][0]

  const computed = computeSalesTax({
    lines: [{
      serviceType: input.serviceType?.trim() || 'unknown',
      amountCents: baseCents,
      description: input.description,
    }],
    address: input.address,
    description: input.description,
  })
  if (!computed.ok) return computed

  return {
    ok: true,
    baseCents,
    chargeCents: input.preTaxAmountCents + computed.quote.tax_cents,
    quote: computed.quote,
  }
}

function dollarsToCents(amount: number): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null
  const cents = Math.round(amount * 100)
  if (!Number.isInteger(cents) || cents <= 0 || !Number.isSafeInteger(cents)) return null
  return cents
}

export function readSalesTaxRequest(body: unknown):
  | { ok: true; address: string | null; description: string | null; lines: SalesTaxLineInput[] }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' }
  }
  const record = body as Record<string, unknown>
  const addressValue = record.address ?? record.location ?? record.start_location
  const address = typeof addressValue === 'string' ? addressValue : null
  const description = typeof record.description === 'string' ? record.description : null

  const rawLines = record.line_items
  if (rawLines !== undefined && !Array.isArray(rawLines)) {
    return { ok: false, error: 'line_items must be an array.' }
  }

  if (Array.isArray(rawLines) && rawLines.length > 0) {
    const lines: SalesTaxLineInput[] = []
    for (const entry of rawLines) {
      if (!entry || typeof entry !== 'object') {
        return { ok: false, error: 'Each line item must be an object.' }
      }
      const item = entry as Record<string, unknown>
      const serviceType = item.service_type ?? item.serviceType
      if (typeof serviceType !== 'string' || !serviceType.trim()) {
        return { ok: false, error: 'Each line item needs service_type.' }
      }
      let amountCents: number | null = null
      if (item.amount_cents !== undefined) {
        amountCents = typeof item.amount_cents === 'number' ? item.amount_cents : null
      } else if (item.amount !== undefined && typeof item.amount === 'number') {
        amountCents = dollarsToCents(item.amount)
      }
      if (amountCents === null) {
        return { ok: false, error: 'Each line item needs amount_cents or amount.' }
      }
      const lineDescription = typeof item.description === 'string' ? item.description : null
      lines.push({ serviceType, amountCents, description: lineDescription })
    }
    return { ok: true, address, description, lines }
  }

  const serviceType = record.service_type ?? record.serviceType
  if (typeof serviceType !== 'string' || !serviceType.trim()) {
    return { ok: false, error: 'service_type is required when line_items are omitted.' }
  }
  let amountCents: number | null = null
  if (typeof record.amount_cents === 'number') amountCents = record.amount_cents
  else if (typeof record.amount === 'number') amountCents = dollarsToCents(record.amount)
  if (amountCents === null) {
    return { ok: false, error: 'amount_cents or amount is required when line_items are omitted.' }
  }
  return {
    ok: true,
    address,
    description,
    lines: [{ serviceType, amountCents, description }],
  }
}
