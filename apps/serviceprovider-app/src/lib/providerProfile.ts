import * as Linking from 'expo-linking';
import { PostgrestError, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

type EnsureServiceProviderProfileOptions = {
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  skipStripeSetup?: boolean;
};

type EnsureServiceProviderProfileResult = {
  success: true;
  stripeAccountId?: string | null;
  stripeOnboardingUrl?: string | null;
  stripeError?: any;
  stripeErrorType?: 'stripe_creation_failed';
} | {
  success: false;
  error: PostgrestError | Error;
  errorType?: 'auth_missing' | 'profile_creation_failed' | 'stripe_creation_failed' | 'network_error';
};

const sanitizeText = (value?: string | null) => {
  if (!value) {
    return '';
  }
  return value.trim();
};

const sanitizePhone = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const cleaned = value.toString().replace(/[^0-9]/g, '').trim();
  if (cleaned.length === 0) {
    return null;
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

export const ensureServiceProviderProfile = async (
  options: EnsureServiceProviderProfileOptions = {},
): Promise<EnsureServiceProviderProfileResult> => {
  try {
    let providerId = options.userId ?? null;
    let authUser: User | null = null;

    if (!providerId || !options.firstName || !options.lastName || !options.email || !options.phone) {
      const { data: userResponse, error: userError } = await supabase.auth.getUser();
      if (!userError) {
        authUser = userResponse.user;
        providerId = providerId ?? authUser?.id ?? null;
      } else if (!providerId) {
        return {
          success: false,
          error: userError,
          errorType: 'auth_missing'
        };
      }
    }

    if (!providerId) {
      return {
        success: false,
        error: new Error('Missing authenticated user ID'),
        errorType: 'auth_missing'
      };
    }

    const preferredFirstName = sanitizeText(options.firstName ?? (authUser?.user_metadata?.first_name as string | null) ?? null);
    const preferredLastName = sanitizeText(options.lastName ?? (authUser?.user_metadata?.last_name as string | null) ?? null);
    const preferredEmail = sanitizeText(options.email ?? authUser?.email ?? (authUser?.user_metadata?.email as string | null) ?? null);
    const preferredPhone = sanitizePhone(options.phone ?? (authUser?.user_metadata?.phone as string | null) ?? null);

    const { data: existing, error: existingError } = await supabase
      .from('service_provider')
      .select('service_provider_id')
      .eq('service_provider_id', providerId)
      .maybeSingle();

    if (existingError) {
      return {
        success: false,
        error: existingError,
        errorType: 'network_error'
      };
    }

    if (existing) {
      // Profile already exists, nothing more to do.
      return { success: true };
    }

    const insertPayload: Record<string, unknown> = {
      service_provider_id: providerId,
      first_name: preferredFirstName || null,
      last_name: preferredLastName || null,
      email: preferredEmail || null,
      phone: preferredPhone,
      jobs_completed: 0,
      rating: null,
      profile_picture_url: null,
      balance: 0,
    };

    const { error: insertError } = await supabase
      .from('service_provider')
      .insert(insertPayload);

    if (insertError) {
      return {
        success: false,
        error: insertError,
        errorType: 'profile_creation_failed'
      };
    }

    // Create Stripe Connect account for the provider (unless skipped)
    if (!options.skipStripeSetup && preferredEmail) {
      try {
        console.log('🏦 Creating Stripe Connect account for provider:', providerId, 'email:', preferredEmail);
        
        const stripeRefreshUrl = Linking.createURL('landing');
        const stripeReturnUrl = Linking.createURL('landing');

        // Send both camelCase and snake_case params to handle different function versions
        const requestBody = {
          // snake_case (database convention)
          service_provider_id: providerId,
          // camelCase variants
          providerId: providerId,
          serviceProviderId: providerId,
          // Email
          email: preferredEmail,
          // Name fields
          firstName: preferredFirstName || undefined,
          lastName: preferredLastName || undefined,
          first_name: preferredFirstName || undefined,
          last_name: preferredLastName || undefined,
          // Deep links for mobile app - use runtime scheme for dev/prod
          refreshUrl: stripeRefreshUrl,
          returnUrl: stripeReturnUrl,
          refresh_url: stripeRefreshUrl,
          return_url: stripeReturnUrl,
        };
        
        console.log('📤 Sending to create-connect-account:', JSON.stringify(requestBody));
        
        const { data: connectData, error: connectError } = await supabase.functions.invoke('create-connect-account', {
          body: requestBody,
        });

        console.log('📥 Response from create-connect-account:', JSON.stringify(connectData), 'error:', connectError);

        if (connectError) {
          console.error('Failed to create Stripe Connect account (invoke error):', connectError);
          // Return partial success with error details
          return {
            success: true,
            stripeAccountId: null,
            stripeOnboardingUrl: null,
            stripeError: connectError,
            stripeErrorType: 'stripe_creation_failed'
          };
        }

        // Check if the edge function returned success
        if (!connectData?.success) {
          console.error('Stripe Connect account creation failed:', connectData?.error || 'Unknown error');
          return {
            success: true,
            stripeAccountId: null,
            stripeOnboardingUrl: null,
            stripeError: connectData?.error || 'Unknown Stripe error',
            stripeErrorType: 'stripe_creation_failed'
          };
        }

        console.log('✅ Stripe Connect account created successfully:', connectData);
        return { 
          success: true, 
          stripeAccountId: connectData?.accountId || connectData?.account_id || null,
          stripeOnboardingUrl: connectData?.onboardingUrl || connectData?.onboarding_url || null,
        };
      } catch (stripeError) {
        console.error('Stripe Connect setup error:', stripeError);
        // Don't fail signup - return success but without Stripe info
        return {
          success: true,
          stripeAccountId: null,
          stripeOnboardingUrl: null,
          stripeError: stripeError,
          stripeErrorType: 'stripe_creation_failed'
        };
      }
    }

    return { success: true, stripeAccountId: null, stripeOnboardingUrl: null };
  } catch (error) {
    return {
      success: false,
      error: error as Error,
      errorType: 'network_error'
    };
  }
};
