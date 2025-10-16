import * as Linking from 'expo-linking';
import { router, Stack, useRootNavigationState, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { AuthProvider } from '../src/contexts/AuthContext';
import { ModalProvider } from '../src/contexts/ModalContext';
import { supabase } from '../src/lib/supabase';

export default function Layout() {
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    // Handle deep links for auth callbacks
    const handleDeepLink = async (event: { url: string }) => {
      const url = event.url;
      console.log('Deep link received:', url);

      // Handle Supabase auth callback
      if (url.includes('serviceproviderapp://auth/callback')) {
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error) {
            console.error('Auth callback error:', error);
          } else if (data.session) {
            // User is authenticated, redirect to landing
            router.replace('/landing');
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
