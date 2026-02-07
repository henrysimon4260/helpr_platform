// Supabase Edge Function for handling Stripe Connect redirects
// Uses a simple HTTP 302 redirect to the app's deep link

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  const url = new URL(req.url)
  const type = url.searchParams.get('type') || 'complete'
  const redirectParam = url.searchParams.get('redirect')
  
  console.log('Stripe redirect received, type:', type)

  const allowedRedirectSchemes = new Set([
    'serviceproviderapp',
    'exp',
    'exps',
    'exp+serviceproviderapp',
  ])

  const buildFallbackUrl = () => {
    const appScheme = 'serviceproviderapp'
    const redirectPath = type === 'refresh' ? 'signup' : 'stripe-complete'
    return `${appScheme}://${redirectPath}`
  }

  const resolveRedirectUrl = () => {
    if (!redirectParam) {
      return buildFallbackUrl()
    }

    try {
      const parsed = new URL(redirectParam)
      const scheme = parsed.protocol.replace(':', '')
      if (!allowedRedirectSchemes.has(scheme)) {
        return buildFallbackUrl()
      }
      return redirectParam
    } catch (_error) {
      return buildFallbackUrl()
    }
  }

  const appUrl = resolveRedirectUrl()

  console.log('Redirecting to:', appUrl)

  // Use HTTP 302 redirect - simpler and more reliable
  return new Response(null, {
    status: 302,
    headers: {
      'Location': appUrl,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
})
