import { supabase } from './supabase'

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

export type CleaningEstimateRequest = {
  description?: string | null
  squareFeet?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  condition?: string | null
  petHair?: boolean | null
  depth?: string | null
  frequency?: string | null
}

export function isCleaningServiceType(serviceType?: string | null): boolean {
  return (serviceType ?? '').toLowerCase().includes('cleaning')
}

export function isServerCleaningEstimate(value: unknown): value is CleaningEstimate {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  const optionalCount = (key: string) => row[key] == null || typeof row[key] === 'number'
  return row.source === 'server'
    && row.serviceType === 'cleaning'
    && row.currency === 'usd'
    && typeof row.priceMin === 'number'
    && typeof row.priceMax === 'number'
    && typeof row.suggestedPrice === 'number'
    && typeof row.durationMinutes === 'number'
    && typeof row.sizeLabel === 'string'
    && row.sizeLabel.length > 0
    && optionalCount('squareFeet')
    && optionalCount('bedrooms')
    && optionalCount('bathrooms')
}

export function formatUsd(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`
}

export function formatJobDuration(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes))
  if (rounded < 90) return `${rounded} min`
  const hours = rounded / 60
  if (hours >= 10) return `${Math.round(hours)} hr`
  const shown = Math.round(hours * 10) / 10
  return `${shown} hr`
}

export function formatCleaningEstimatePrice(estimate: CleaningEstimate): string {
  return `${formatUsd(estimate.priceMin)}–${formatUsd(estimate.priceMax)}`
}

export function formatCleaningEstimateDetail(estimate: CleaningEstimate): string {
  return `${formatJobDuration(estimate.durationMinutes)} · ${estimate.sizeLabel}`
}

export async function requestCleaningEstimate(
  input: CleaningEstimateRequest,
): Promise<{ ok: true; estimate: CleaningEstimate } | { ok: false; error: string }> {
  const body: Record<string, unknown> = { serviceType: 'cleaning' }
  if (input.description?.trim()) body.description = input.description.trim()
  if (typeof input.squareFeet === 'number') body.squareFeet = input.squareFeet
  if (typeof input.bedrooms === 'number') body.bedrooms = input.bedrooms
  if (typeof input.bathrooms === 'number') body.bathrooms = input.bathrooms
  if (input.condition?.trim()) body.condition = input.condition.trim()
  if (typeof input.petHair === 'boolean') body.petHair = input.petHair
  if (input.depth?.trim()) body.depth = input.depth.trim()
  if (input.frequency?.trim()) body.frequency = input.frequency.trim()

  try {
    const { data, error } = await supabase.functions.invoke('quote-service-price', { body })
    if (isServerCleaningEstimate(data)) {
      return { ok: true, estimate: data }
    }
    const serverError = data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : null
    return { ok: false, error: serverError || error?.message || 'Estimate unavailable' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Estimate unavailable'
    return { ok: false, error: message }
  }
}
