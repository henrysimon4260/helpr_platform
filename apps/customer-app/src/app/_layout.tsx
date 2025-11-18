import * as Linking from 'expo-linking';
import { router, Stack, useRootNavigationState, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { AuthProvider } from '../context/AuthContext';
import { ModalProvider } from '../context/ModalContext';
import { supabase } from '../lib/supabase';

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
        <Stack.Screen name="moving" options={{ animation: 'fade' , animationDuration: 100}} />
        <Stack.Screen name="cleaning" options={{ animation: 'fade' , animationDuration: 100}} />
        <Stack.Screen name="furniture-assembly" options={{ animation: 'fade',animationDuration: 100}} />
        <Stack.Screen name="home-improvement" options={{ animation: 'fade' , animationDuration: 100}} />
        <Stack.Screen name="running-errands" options={{ animation: 'fade' , animationDuration: 100}} />
        <Stack.Screen name="wall-mounting" options={{ animation: 'fade' , animationDuration: 100}} />
        <Stack.Screen name="booked-services" options={{ animation: 'fade' , animationDuration: 100}} />
        <Stack.Screen name="past-services" options={{ animation: 'fade' , animationDuration: 100}} />
        <Stack.Screen name="contact-support" options={{ animation: 'fade' , animationDuration: 100}} />
        <Stack.Screen name="user-guide" options={{ animation: 'fade' , animationDuration: 100}} />
        </Stack>
      </ModalProvider>
    </AuthProvider>
  );
}