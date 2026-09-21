// Creates a Stripe Custom Connect account for the signed-in provider.
// Requires a user JWT. Anon and missing tokens are rejected before Stripe.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import {
  CONNECT_BAD_REQUEST,
  CONNECT_EMAIL_MISMATCH,
  CONNECT_NOT_CONFIGURED,
  CONNECT_SIGN_IN,
  CONNECT_UNAVAILABLE,
  authorizeConnectAccount,
  connectAccountIdentity,
  connectLogFields,
  readClientEmail,
  readClientProviderId,
  readConnectProfile,
  readConnectSession,
  readSsnLast4,
  redactSensitiveText,
  stripeAccountMissing,
  type ProviderConnectRow,
} from '../_shared/connectAccountAuthorization.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PROVIDER_COLUMNS = 'service_provider_id, stripe_account_id, email'

const allowedRedirectSchemes = new Set([
  'serviceproviderapp',
  'exp',
  'exps',
  'exp+serviceproviderapp',
])

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`)
}

function publicErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Failed to create Stripe account'
  if (/\d{4,}/.test(message)) return 'Failed to create Stripe account'
  return message
}

const sanitizeDeepLink = (value?: string | null) => {
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

const buildStripeRedirectUrl = (baseUrl: string, type: 'refresh' | 'complete', deepLink?: string | null) => {
  const trimmedBase = baseUrl.replace(/\/+$/, '')
  const separator = trimmedBase.includes('?') ? '&' : '?'
  const url = `${trimmedBase}${separator}type=${type}`
  if (!deepLink) return url
  return `${url}&redirect=${encodeURIComponent(deepLink)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Cannot authorize create-connect-account: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set')
      return jsonResponse({ success: false, error: CONNECT_NOT_CONFIGURED }, 500)
    }

    const session = readConnectSession(req.headers.get('Authorization'))
    if (!session.ok) {
      return jsonResponse({ success: false, error: session.error }, session.status)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const { data: userData, error: userError } = await supabase.auth.getUser(session.jwt)
    if (userError || !userData.user?.id) {
      console.error('create-connect-account rejected: caller is not signed in')
      return jsonResponse({ success: false, error: CONNECT_SIGN_IN }, 401)
    }

    const authUserId = userData.user.id
    const authEmail = typeof userData.user.email === 'string' ? userData.user.email : null

    let body: Record<string, unknown>
    try {
      const parsed = await req.json()
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return jsonResponse({ success: false, error: CONNECT_BAD_REQUEST }, 400)
      }
      body = parsed as Record<string, unknown>
    } catch (_error) {
      return jsonResponse({ success: false, error: CONNECT_BAD_REQUEST }, 400)
    }

    const ssn = readSsnLast4(body)
    if (!ssn.ok) {
      return jsonResponse({ success: false, error: ssn.error }, ssn.status)
    }

    const clientProviderId = readClientProviderId(body)
    if (clientProviderId === 'invalid' || clientProviderId === 'conflict') {
      return jsonResponse({ success: false, error: CONNECT_BAD_REQUEST }, 400)
    }

    const clientEmail = readClientEmail(body.email)
    if (clientEmail === 'invalid') {
      return jsonResponse({ success: false, error: CONNECT_EMAIL_MISMATCH }, 400)
    }

    let accountLookupFailed = false
    const accounts: ProviderConnectRow[] = []

    const { data: own, error: ownError } = await supabase
      .from('service_provider')
      .select(PROVIDER_COLUMNS)
      .eq('service_provider_id', authUserId)
      .maybeSingle()

    if (ownError) {
      console.error('create-connect-account provider lookup failed')
      accountLookupFailed = true
    } else if (own) {
      accounts.push(own as ProviderConnectRow)
    }

    if (!accountLookupFailed && authEmail && authEmail.trim()) {
      const trimmedEmail = authEmail.trim()
      const [byCase, exact] = await Promise.all([
        supabase.from('service_provider').select(PROVIDER_COLUMNS).ilike('email', escapeIlike(trimmedEmail)),
        supabase.from('service_provider').select(PROVIDER_COLUMNS).eq('email', trimmedEmail),
      ])

      if (byCase.error || exact.error) {
        console.error('create-connect-account email lookup failed')
        accountLookupFailed = true
      } else {
        for (const row of [...(byCase.data ?? []), ...(exact.data ?? [])]) {
          const typed = row as ProviderConnectRow
          if (!accounts.some((existing) => existing.service_provider_id === typed.service_provider_id)) {
            accounts.push(typed)
          }
        }
      }
    }

    const decision = authorizeConnectAccount({
      authUserId,
      authEmail,
      clientProviderId,
      clientEmail,
      accounts,
      accountLookupFailed,
      ssnLast4: ssn.ssnLast4,
    })
    if (!decision.ok) {
      console.error('create-connect-account rejected before Stripe', {
        authUserId,
        status: decision.status,
      })
      return jsonResponse({ success: false, error: decision.error }, decision.status)
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY not configured')
      return jsonResponse({ success: false, error: 'Stripe is not configured on the server' }, 500)
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    if (decision.existingStripeAccountId && decision.existingStripeProviderId) {
      try {
        const existingAccount = await stripe.accounts.retrieve(decision.existingStripeAccountId)
        return jsonResponse({
          success: false,
          error: 'A Stripe Connect account already exists for this email address. Please contact support if you need to access your existing account.',
          existingAccount: {
            accountId: existingAccount.id,
            email: existingAccount.email,
            charges_enabled: existingAccount.charges_enabled,
            payouts_enabled: existingAccount.payouts_enabled,
          },
        }, 409)
      } catch (stripeError) {
        if (!stripeAccountMissing(stripeError)) {
          console.error('create-connect-account could not verify the stored Connect account')
          return jsonResponse({ success: false, error: CONNECT_UNAVAILABLE }, 500)
        }
        console.error('Stored Connect account is missing in Stripe')
        const { error: cleanupError } = await supabase
          .from('service_provider')
          .update({ stripe_account_id: null })
          .eq('service_provider_id', decision.existingStripeProviderId)
        if (cleanupError) {
          console.error('Failed to clear invalid Connect account reference')
          return jsonResponse({ success: false, error: CONNECT_UNAVAILABLE }, 500)
        }
      }
    }

    const profile = readConnectProfile(body)
    const supabaseProjectUrl = 'https://hecikcopbdhhiilhgmrd.supabase.co'
    const redirectBaseUrl = Deno.env.get('STRIPE_REDIRECT_BASE_URL')
      || `${supabaseProjectUrl}/functions/v1/stripe-redirect`
    const requestedRefreshUrl = sanitizeDeepLink(
      typeof body.refreshUrl === 'string' ? body.refreshUrl : typeof body.refresh_url === 'string' ? body.refresh_url : null,
    )
    const requestedReturnUrl = sanitizeDeepLink(
      typeof body.returnUrl === 'string' ? body.returnUrl : typeof body.return_url === 'string' ? body.return_url : null,
    )
    const refreshUrl = buildStripeRedirectUrl(redirectBaseUrl, 'refresh', requestedRefreshUrl)
    const returnUrl = buildStripeRedirectUrl(redirectBaseUrl, 'complete', requestedReturnUrl)

    console.log('Creating Stripe Custom account', connectLogFields({
      providerId: decision.providerId,
      hasDob: !!profile.dob,
      hasAddress: !!profile.address,
      hasSsnLast4: !!decision.ssnLast4,
    }))

    const identity = connectAccountIdentity({
      providerId: decision.providerId,
      email: decision.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      ssnLast4: decision.ssnLast4,
      dob: profile.dob,
      address: profile.address,
    })

    const account = await stripe.accounts.create({
      type: 'custom',
      country: 'US',
      email: identity.email,
      business_type: 'individual',
      metadata: identity.metadata,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      individual: identity.individual,
      business_profile: {
        mcc: '7299',
        product_description: 'Home services and task assistance provided through the Helpr platform',
      },
    })

    console.log('Custom account created:', account.id)

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
      collection_options: {
        fields: 'eventually_due',
        future_requirements: 'include',
      },
    })

    console.log('Onboarding link created')

    return jsonResponse({
      success: true,
      accountId: account.id,
      account_id: account.id,
      onboardingUrl: accountLink.url,
      onboarding_url: accountLink.url,
    }, 200)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Stripe account'
    console.error('Error creating Custom account:', redactSensitiveText(message))
    return jsonResponse({ success: false, error: publicErrorMessage(error) }, 500)
  }
})
