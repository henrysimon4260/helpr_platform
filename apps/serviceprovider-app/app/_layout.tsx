import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { router, Stack, useRootNavigationState, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { AuthProvider } from '../src/contexts/AuthContext';
import { ModalProvider } from '../src/contexts/ModalContext';
import { supabase } from '../src/lib/supabase';

// Key for storing pending signup data during Stripe onboarding
const PENDING_SIGNUP_KEY = 'pending_stripe_signup';

export default function Layout() {
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    // Handle deep links for auth callbacks and Stripe redirects
    const handleDeepLink = async (event: { url: string }) => {
      const url = event.url;
      console.log('🔗 Deep link received:', url);
      const parsedPath = Linking.parse(url).path ?? '';

      // Handle Stripe onboarding complete redirect
      if (
        parsedPath.startsWith('stripe-complete')
        || parsedPath.startsWith('landing')
        || parsedPath.startsWith('signup')
      ) {
        console.log('✅ Stripe onboarding complete, navigating to signup...');
        // Navigate to signup page which will check for pending data and complete signup
        router.replace('/signup');
        return;
      }

      // For OAuth callbacks, let Supabase handle it automatically since detectSessionInUrl is true
      if (parsedPath.startsWith('auth/callback')) {
        console.log('🔐 OAuth callback received, URL:', url);
        console.log('🔍 URL params:', new URL(url).searchParams.toString());
        console.log('🔍 URL hash:', new URL(url).hash);

        // Give Supabase a moment to process the callback, then check session
        setTimeout(async () => {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error) {
            console.error('❌ OAuth callback error:', error);
            // Navigate to login with error message
            router.replace({
              pathname: '/login',
              params: { error: 'oauth_failed', message: error.message }
            } as any);
          } else if (session) {
            console.log('✅ OAuth session established:', session.user?.email);

            try {
              // Try to ensure service provider profile exists
              const userMetadata = (session.user?.user_metadata ?? {}) as {
                first_name?: string;
                last_name?: string;
                phone?: string;
              };

              const { ensureServiceProviderProfile } = await import('../src/lib/providerProfile');
              const ensureResult = await ensureServiceProviderProfile({
                userId: session.user?.id,
                email: session.user?.email ?? '',
                firstName: userMetadata.first_name,
                lastName: userMetadata.last_name,
                phone: userMetadata.phone,
              });

              if (!ensureResult.success) {
                console.warn('⚠️ Failed to ensure provider profile after OAuth:', ensureResult.error);
                // Navigate back to login with error
                router.replace({
                  pathname: '/login',
                  params: {
                    error: 'profile_creation_failed',
                    message: ensureResult.errorType === 'auth_missing'
                      ? 'Authentication session expired. Please sign in again.'
                      : 'Failed to create your service provider profile. Please try signing up again.'
                  }
                } as any);
              } else {
                console.log('✅ Service provider profile ensured after OAuth');
                if (ensureResult.stripeError) {
                  console.warn('⚠️ Stripe account creation failed:', ensureResult.stripeError);
                  // Navigate with warning about Stripe setup
                  router.replace({
                    pathname: '/landing',
                    params: { warning: 'stripe_setup_failed' }
                  } as any);
                } else {
                  router.replace('/landing');
                }
              }
            } catch (profileError) {
              console.error('❌ Error ensuring provider profile after OAuth:', profileError);
              // Still navigate to landing but show a warning
              router.replace({
                pathname: '/landing',
                params: { warning: 'profile_creation_failed' }
              } as any);
            }
          } else {
            console.log('⚠️ No session after OAuth callback - check Supabase redirect URL config');
            console.log('💡 Make sure your Supabase dashboard has redirect URL: serviceproviderapp://auth/callback');
            router.replace({
              pathname: '/login',
              params: { error: 'no_session', message: 'Authentication failed. Please try again.' }
            } as any);
          }
        }, 1500);
      }
    };

    // Listen for deep links
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Handle initial URL if app was opened from a link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <AuthProvider>
      <ModalProvider>
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        >
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Screen name="login" options={{ animation: 'fade', animationDuration: 100 }} />
        <Stack.Screen name="signup" options={{ animation: 'fade', animationDuration: 100 }} />
        <Stack.Screen name="account" options={{ animation: 'fade', animationDuration: 100 }} />
        <Stack.Screen name="landing" options={{ animation: 'none' }} />
        <Stack.Screen name="customer-service-chat" options={{ animation: 'fade', animationDuration: 100 }} />
        </Stack>
      </ModalProvider>
    </AuthProvider>
  );
}
