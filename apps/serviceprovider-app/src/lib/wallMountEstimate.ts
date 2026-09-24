import { supabase } from './supabase'

export type WallMountEstimate = {
  serviceType: 'wall-mounting'
  itemLabel: string
  wallType: string | null
  heightFeet: number | null
  studFinding: boolean | null
  hardwareIncluded: boolean | null
  priceMin: number
  priceMax: number
  suggestedPrice: number
  durationMinutes: number
  currency: 'usd'
  source: 'server'
}

export type WallMountEstimateRequest = {
  description?: string | null
}

export function isWallMountingServiceType(serviceType?: string | null): boolean {
  const compact = (serviceType ?? '').toLowerCase().replace(/[\s_-]+/g, '')
  return compact === 'wallmounting' || compact === 'wallmount'
}

export function isServerWallMountEstimate(value: unknown): value is WallMountEstimate {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return row.source === 'server'
    && row.serviceType === 'wall-mounting'
    && row.currency === 'usd'
    && typeof row.priceMin === 'number'
    && typeof row.priceMax === 'number'
    && typeof row.suggestedPrice === 'number'
    && typeof row.durationMinutes === 'number'
    && typeof row.itemLabel === 'string'
    && row.itemLabel.length > 0
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

export function formatWallMountEstimatePrice(estimate: WallMountEstimate): string {
  return `${formatUsd(estimate.priceMin)}–${formatUsd(estimate.priceMax)}`
}

export function formatWallMountEstimateDetail(estimate: WallMountEstimate): string {
  const extras = [
    estimate.wallType,
    estimate.heightFeet != null ? `${estimate.heightFeet} ft` : null,
    estimate.studFinding === true ? 'find studs' : estimate.studFinding === false ? 'studs marked' : null,
    estimate.hardwareIncluded === true ? 'hardware included' : estimate.hardwareIncluded === false ? 'hardware not included' : null,
  ].filter((part): part is string => Boolean(part))
  const extra = extras.length > 0 ? ` · ${extras.join(' · ')}` : ''
  return `${formatJobDuration(estimate.durationMinutes)} · ${estimate.itemLabel}${extra}`
}

export async function requestWallMountEstimate(
  input: WallMountEstimateRequest,
): Promise<{ ok: true; estimate: WallMountEstimate } | { ok: false; error: string }> {
  const body: Record<string, unknown> = { serviceType: 'wall-mounting' }
  if (input.description?.trim()) body.description = input.description.trim()

  try {
    const { data, error } = await supabase.functions.invoke('quote-service-price', { body })
    if (isServerWallMountEstimate(data)) {
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
