// Supabase Edge Function for creating Stripe Custom Connect accounts
// Custom accounts give us full control over the onboarding UI
// Deploy with: supabase functions deploy create-connect-account

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Supabase configuration
const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://hecikcopbdhhiilhgmrd.supabase.co'
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

interface RequestBody {
  providerId?: string
  service_provider_id?: string
  serviceProviderId?: string
  email: string
  firstName?: string
  lastName?: string
  first_name?: string
  last_name?: string
  refreshUrl?: string
  returnUrl?: string
  refresh_url?: string
  return_url?: string
  // Identity verification fields
  dob?: {
    day: number
    month: number
    year: number
  }
  address?: {
    line1: string
    city: string
    state: string
    postal_code: string
    country?: string
  }
  ssn_last_4?: string
}

const allowedRedirectSchemes = new Set([
  'serviceproviderapp',
  'exp',
  'exps',
  'exp+serviceproviderapp',
])

const sanitizeDeepLink = (value?: string | null) => {
  if (!value) {
    return null
  }

  try {
    const parsed = new URL(value)
    const scheme = parsed.protocol.replace(':', '')
    if (!allowedRedirectSchemes.has(scheme)) {
      return null
    }
    return value
  } catch (_error) {
    return null
  }
}

const buildStripeRedirectUrl = (baseUrl: string, type: 'refresh' | 'complete', deepLink?: string | null) => {
  const trimmedBase = baseUrl.replace(/\/+$/, '')
  const separator = trimmedBase.includes('?') ? '&' : '?'
  const url = `${trimmedBase}${separator}type=${type}`
  if (!deepLink) {
    return url
  }
  return `${url}&redirect=${encodeURIComponent(deepLink)}`
}

Deno.serve(async (req) => {
  console.log('🔄 create-connect-account function called, method:', req.method);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔍 Checking environment variables...');
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

    if (!stripeSecretKey) {
      console.error('❌ STRIPE_SECRET_KEY not configured')
      return new Response(
        JSON.stringify({ success: false, error: 'Stripe is not configured on the server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ Stripe key found, initializing Stripe client...');

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const body: RequestBody = await req.json()
    console.log('Received request body:', JSON.stringify(body))

    const providerId = body.providerId || body.service_provider_id || body.serviceProviderId
    const email = body.email
    const firstName = body.firstName || body.first_name
    const lastName = body.lastName || body.last_name
    // Identity verification data (pre-filled from app signup form)
    const dob = body.dob
    const address = body.address
    const ssnLast4 = body.ssn_last_4
    // Stripe requires HTTPS URLs - use the Vercel redirect page when configured.
    const supabaseProjectUrl = 'https://hecikcopbdhhiilhgmrd.supabase.co'
    const redirectBaseUrl = Deno.env.get('STRIPE_REDIRECT_BASE_URL')
      || `${supabaseProjectUrl}/functions/v1/stripe-redirect`

    const requestedRefreshUrl = sanitizeDeepLink(body.refreshUrl || body.refresh_url)
    const requestedReturnUrl = sanitizeDeepLink(body.returnUrl || body.return_url)

    const refreshUrl = buildStripeRedirectUrl(redirectBaseUrl, 'refresh', requestedRefreshUrl)
    const returnUrl = buildStripeRedirectUrl(redirectBaseUrl, 'complete', requestedReturnUrl)
    
    console.log('Using redirect URLs:', { refreshUrl, returnUrl })

    if (!email) {
      console.error('Missing required parameter: email')
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameter: email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if SUPABASE_SERVICE_ROLE_KEY is available for duplicate checking
    let supabase: any = null;
    let duplicateCheckEnabled = false;

    if (supabaseServiceKey) {
      try {
        // Initialize Supabase client with service role key
        supabase = createClient(supabaseUrl, supabaseServiceKey);
        duplicateCheckEnabled = true;
        console.log('✅ Database duplicate checking enabled');
      } catch (error) {
        console.warn('⚠️ Failed to initialize Supabase client, duplicate checking disabled:', error.message);
      }
    } else {
      console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY not configured - duplicate checking disabled');
    }

    // Check for existing Stripe account with this email (if database access is available)
    if (duplicateCheckEnabled && supabase) {
      console.log('Checking for existing Stripe account with email:', email);
      const { data: existingProvider, error: checkError } = await supabase
        .from('service_provider')
        .select('service_provider_id, stripe_account_id, email')
        .eq('email', email)
        .not('stripe_account_id', 'is', null)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking for existing account:', checkError);
        // Continue with account creation despite database error
      } else if (existingProvider) {
        console.log('Found existing Stripe account for email:', email, 'Account ID:', existingProvider.stripe_account_id);

        // Verify the existing account still exists in Stripe
        try {
          const existingAccount = await stripe.accounts.retrieve(existingProvider.stripe_account_id);
          console.log('Existing account is valid and active');

          // Return existing account information
          return new Response(
            JSON.stringify({
              success: false,
              error: 'A Stripe Connect account already exists for this email address. Please contact support if you need to access your existing account.',
              existingAccount: {
                accountId: existingAccount.id,
                email: existingAccount.email,
                charges_enabled: existingAccount.charges_enabled,
                payouts_enabled: existingAccount.payouts_enabled,
              }
            }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (stripeError) {
          console.log('Existing account in database is invalid or deleted in Stripe:', stripeError.message);

          // If the account doesn't exist in Stripe, clean up the database and allow creation of new account
          console.log('Cleaning up invalid account reference in database');
          const { error: cleanupError } = await supabase
            .from('service_provider')
            .update({ stripe_account_id: null })
            .eq('service_provider_id', existingProvider.service_provider_id);

          if (cleanupError) {
            console.error('Failed to clean up invalid account reference:', cleanupError);
          } else {
            console.log('Cleaned up invalid account reference');
          }
          // Continue with account creation below
        }
      }
    } else {
      console.log('Skipping duplicate check - database access not available');
    }

    console.log('Creating Stripe Custom account for:', {
      providerId: providerId || 'pending',
      email,
      firstName,
      lastName,
      hasDob: !!dob,
      hasAddress: !!address,
      hasSsnLast4: !!ssnLast4,
    })

    // Create CUSTOM account - gives us full control over onboarding UI
    // We pre-fill all identity info so user only sees: bank account and ID document upload
    const account = await stripe.accounts.create({
      type: 'custom',
      country: 'US',
      email: email,
      business_type: 'individual',
      metadata: {
        provider_id: providerId || 'pending',
        email: email,
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      individual: {
        ...(firstName && { first_name: firstName }),
        ...(lastName && { last_name: lastName }),
        email: email,
        // Pre-fill Date of Birth
        ...(dob && {
          dob: {
            day: dob.day,
            month: dob.month,
            year: dob.year,
          },
        }),
        // Pre-fill Address
        ...(address && {
          address: {
            line1: address.line1,
            city: address.city,
            state: address.state,
            postal_code: address.postal_code,
            country: address.country || 'US',
          },
        }),
        // Pre-fill SSN last 4 digits
        ...(ssnLast4 && { ssn_last_4: ssnLast4 }),
      },
      business_profile: {
        // MCC 7299 = Miscellaneous Recreation Services (covers general gig/service work)
        // Pre-filled so user never sees industry selection
        mcc: '7299',
        // Pre-fill product description
        product_description: 'Home services and task assistance provided through the Helpr platform',
      },
      // TOS will be accepted during hosted onboarding
    })

    console.log('Custom account created:', account.id)

    // Create onboarding link with collection_options to require ALL info upfront
    // This ensures ID verification, SSN, bank details are collected BEFORE the review page
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
      collection_options: {
        // Collect all eventually_due fields upfront (not just currently_due)
        // This includes SSN, ID verification, bank account, etc.
        fields: 'eventually_due',
        // Also collect fields that will be required in the future
        future_requirements: 'include',
      },
    })

    console.log('Onboarding link created:', accountLink.url)

    return new Response(
      JSON.stringify({
        success: true,
        accountId: account.id,
        account_id: account.id,
        onboardingUrl: accountLink.url,
        onboarding_url: accountLink.url,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error creating Custom account:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to create Stripe account'
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

