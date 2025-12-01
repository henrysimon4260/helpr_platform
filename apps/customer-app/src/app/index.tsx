import { useRootNavigationState, useRouter } from 'expo-router';
import * as SplashScreenModule from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function SplashComponent() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, loading } = useAuth();
  const [hasNavigated, setHasNavigated] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    console.log('Splash screen - loading:', loading, 'user:', user, 'navState:', rootNavigationState?.key);

    if (loading) return; // Wait for auth check
    if (!rootNavigationState?.key) return; // Wait for navigation to be ready
    if (hasNavigated) return; // Already navigated

    const navigateAfterSplash = async () => {
      try {
        await SplashScreenModule.preventAutoHideAsync();
        await SplashScreenModule.hideAsync();
      } catch (error) {
        console.warn('Splash screen error:', error);
      }

      // Wait longer to show splash, then fade quicker
      setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 1200,
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            setHasNavigated(true);
            const targetRoute = user ? '/(tabs)/landing' : '/(tabs)/login';
            console.log('Navigating to:', targetRoute);
            router.replace(targetRoute as any);
          }
        });
      }, 800);
    };

    navigateAfterSplash();
  }, [router, user, loading, rootNavigationState?.key, fadeAnim, hasNavigated]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.splashContainer, { opacity: fadeAnim }]}>
        <Image
          source={require('../assets/images/splash.png')}
          style={styles.splashImage}
          resizeMode="cover"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C4309',
  },
  splashContainer: {
    flex: 1,
  },
  splashImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});