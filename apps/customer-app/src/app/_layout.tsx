import { StripeProvider } from '@stripe/stripe-react-native';
import * as Linking from 'expo-linking';
import { router, Stack, useRootNavigationState, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { AuthProvider } from '../context/AuthContext';
import { ModalProvider } from '../context/ModalContext';
import { supabase } from '../lib/supabase';

// TODO: Move to environment variable
const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

export default function Layout() {
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    // Handle deep links for auth callbacks
    const handleDeepLink = async (event: { url: string }) => {
      const url = event.url;
      console.log('Deep link received:', url);

      // Handle Supabase auth callback
      if (url.includes('customerapp://auth/callback')) {
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error) {
            console.error('Auth callback error:', error);
          } else if (data.session) {
            // User is authenticated, redirect to landing
            router.replace('/(home)/landing' as never);
          }
        } catch (err) {
          console.error('Error handling auth callback:', err);
        }
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
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <AuthProvider>
        <ModalProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'none',
              contentStyle: { backgroundColor: '#0C4309' },
            }}
          >
            <Stack.Screen name="index" options={{ animation: 'none' }} />
            <Stack.Screen name="(auth)" options={{ animation: 'none' }} />
            <Stack.Screen name="(home)" options={{ animation: 'none' }} />
            <Stack.Screen name="(services)" options={{ animation: 'none' }} />
            <Stack.Screen name="(booking-flow)" options={{ animation: 'none' }} />
          </Stack>
        </ModalProvider>
      </AuthProvider>
    </StripeProvider>
  );
}
