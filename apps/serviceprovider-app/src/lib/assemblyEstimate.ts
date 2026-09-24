import { supabase } from './supabase'

export type AssemblyEstimate = {
  serviceType: 'furniture-assembly'
  itemLabel: string
  pieceCount: number
  complexity: string
  toolsNeeded: string | null
  photoCount: number
  priceMin: number
  priceMax: number
  suggestedPrice: number
  durationMinutes: number
  currency: 'usd'
  source: 'server'
}

export type AssemblyEstimateRequest = {
  description?: string | null
}

export function isFurnitureAssemblyServiceType(serviceType?: string | null): boolean {
  const compact = (serviceType ?? '').toLowerCase().replace(/[\s_-]+/g, '')
  return compact.includes('furnitureassembly') || compact === 'assembly'
}

export function isServerAssemblyEstimate(value: unknown): value is AssemblyEstimate {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return row.source === 'server'
    && row.serviceType === 'furniture-assembly'
    && row.currency === 'usd'
    && typeof row.priceMin === 'number'
    && typeof row.priceMax === 'number'
    && typeof row.suggestedPrice === 'number'
    && typeof row.durationMinutes === 'number'
    && typeof row.itemLabel === 'string'
    && row.itemLabel.length > 0
    && typeof row.pieceCount === 'number'
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

export function formatAssemblyEstimatePrice(estimate: AssemblyEstimate): string {
  return `${formatUsd(estimate.priceMin)}–${formatUsd(estimate.priceMax)}`
}

export function formatAssemblyEstimateDetail(estimate: AssemblyEstimate): string {
  const tools = estimate.toolsNeeded ? ` · ${estimate.toolsNeeded}` : ''
  return `${formatJobDuration(estimate.durationMinutes)} · ${estimate.itemLabel}${tools}`
}

export async function requestAssemblyEstimate(
  input: AssemblyEstimateRequest,
): Promise<{ ok: true; estimate: AssemblyEstimate } | { ok: false; error: string }> {
  const body: Record<string, unknown> = { serviceType: 'furniture-assembly' }
  if (input.description?.trim()) body.description = input.description.trim()

  try {
    const { data, error } = await supabase.functions.invoke('quote-service-price', { body })
    if (isServerAssemblyEstimate(data)) {
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
