import { useRouter } from 'expo-router';
import * as SplashScreenModule from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function SplashComponent() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    console.log('Splash screen - loading:', loading, 'user:', user);

    if (loading) return; // Wait for auth check

    const navigateAfterSplash = async () => {
      try {
        await SplashScreenModule.preventAutoHideAsync();
        await SplashScreenModule.hideAsync();

        const targetRoute = user ? '/landing' : '/login';
        console.log('Navigating to:', targetRoute);
        router.replace((targetRoute + '?splash=true') as any);
      } catch (error) {
        console.warn('Splash screen error:', error);
        const targetRoute = user ? '/landing' : '/login';
        router.replace((targetRoute + '?splash=true') as any);
      }
    };

    navigateAfterSplash();
  }, [router, user, loading]);

  return (
    <View style={styles.container}>
      {/* The splash image is handled by Expo's SplashScreen, no need to render here */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c4309', // Match your landing background
  },
});