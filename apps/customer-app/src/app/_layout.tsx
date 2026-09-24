import { StripeProvider } from '@stripe/stripe-react-native';
import { Stack } from 'expo-router';
import { AuthCallbackHandler } from '../context/AuthCallbackHandler';
import { AuthProvider } from '../context/AuthContext';
import { ModalProvider } from '../context/ModalContext';

// TODO: Move to environment variable
const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

export default function Layout() {
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <AuthProvider>
        <AuthCallbackHandler />
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
