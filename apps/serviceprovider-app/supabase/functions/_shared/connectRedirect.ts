const allowedRedirectSchemes = new Set([
  'serviceproviderapp',
  'exp',
  'exps',
  'exp+serviceproviderapp',
])

export function sanitizeDeepLink(value?: string | null): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    const scheme = parsed.protocol.replace(':', '')
    if (!allowedRedirectSchemes.has(scheme)) return null
    return value
  } catch (_error) {
    return null
  }
}

export function stripeRedirectBase(): string {
  const supabaseProjectUrl = Deno.env.get('SUPABASE_URL') || 'https://hecikcopbdhhiilhgmrd.supabase.co'
  return Deno.env.get('STRIPE_REDIRECT_BASE_URL') || `${supabaseProjectUrl}/functions/v1/stripe-redirect`
}

export function buildStripeRedirectUrl(
  type: 'refresh' | 'complete',
  deepLink?: string | null,
): string {
  const trimmedBase = stripeRedirectBase().replace(/\/+$/, '')
  const separator = trimmedBase.includes('?') ? '&' : '?'
  const url = `${trimmedBase}${separator}type=${type}`
  if (!deepLink) return url
  return `${url}&redirect=${encodeURIComponent(deepLink)}`
}
