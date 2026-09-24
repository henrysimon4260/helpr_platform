import { supabase } from './supabase'

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

export type MovingEstimateRequest = {
  origin: { address?: string | null; latitude?: number; longitude?: number }
  destination: { address?: string | null; latitude?: number; longitude?: number }
  description?: string | null
  stairs?: boolean
  elevator?: boolean
  floor?: number
  volumeHint?: string
  weightHint?: string
  crewSize?: number
  needsTruck?: boolean
}

export function isMovingServiceType(serviceType?: string | null): boolean {
  return (serviceType ?? '').toLowerCase().includes('moving')
}

export function isServerMovingEstimate(value: unknown): value is MovingEstimate {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return row.source === 'server'
    && row.serviceType === 'moving'
    && row.currency === 'usd'
    && typeof row.priceMin === 'number'
    && typeof row.priceMax === 'number'
    && typeof row.suggestedPrice === 'number'
    && typeof row.durationMinutes === 'number'
    && typeof row.distanceMiles === 'number'
    && typeof row.drivingDurationMinutes === 'number'
}

function placePayload(place: MovingEstimateRequest['origin']) {
  const address = place.address?.trim()
  const payload: { address?: string; latitude?: number; longitude?: number } = {}
  if (address) payload.address = address
  if (typeof place.latitude === 'number' && typeof place.longitude === 'number') {
    payload.latitude = place.latitude
    payload.longitude = place.longitude
  }
  return payload
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

export function formatMovingEstimatePrice(estimate: MovingEstimate): string {
  return `${formatUsd(estimate.priceMin)}–${formatUsd(estimate.priceMax)}`
}

export function formatMovingEstimateDetail(estimate: MovingEstimate): string {
  const miles = estimate.distanceMiles.toFixed(1)
  return `${formatJobDuration(estimate.durationMinutes)} · ${miles} mi drive`
}

export async function requestMovingEstimate(
  input: MovingEstimateRequest,
): Promise<{ ok: true; estimate: MovingEstimate } | { ok: false; error: string }> {
  const body: Record<string, unknown> = {
    serviceType: 'moving',
    origin: placePayload(input.origin),
    destination: placePayload(input.destination),
  }
  if (input.description?.trim()) body.description = input.description.trim()
  if (typeof input.stairs === 'boolean') body.stairs = input.stairs
  if (typeof input.elevator === 'boolean') body.elevator = input.elevator
  if (typeof input.floor === 'number') body.floor = input.floor
  if (input.volumeHint?.trim()) body.volumeHint = input.volumeHint.trim()
  if (input.weightHint?.trim()) body.weightHint = input.weightHint.trim()
  if (typeof input.crewSize === 'number') body.crewSize = input.crewSize
  if (typeof input.needsTruck === 'boolean') body.needsTruck = input.needsTruck

  try {
    const { data, error } = await supabase.functions.invoke('quote-service-price', { body })
    if (isServerMovingEstimate(data)) {
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
