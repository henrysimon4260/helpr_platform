import { useRootNavigationState, useRouter } from 'expo-router';
import * as SplashScreenModule from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { resolveLaunchRoute } from '../context/guestFormDraft';

export default function SplashComponent() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user, loading, returnTo, returnToHydrated } = useAuth();
  const [hasNavigated, setHasNavigated] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    console.log('Splash screen - loading:', loading, 'user:', user, 'navState:', rootNavigationState?.key);

    if (loading || !returnToHydrated) return; // Wait for auth check and any saved guest draft
    if (!rootNavigationState?.key) return; // Wait for navigation to be ready
    if (hasNavigated) return; // Already navigated

    let cancelled = false;

    (async () => {
      try {
        await SplashScreenModule.preventAutoHideAsync();
        await SplashScreenModule.hideAsync();
      } catch (error) {
        console.warn('Splash screen error:', error);
      }
    })();

    const timer = setTimeout(() => {
      if (cancelled || hasNavigated) {
        return;
      }

      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 800,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || cancelled) {
          return;
        }
        setHasNavigated(true);
        const targetRoute = resolveLaunchRoute({ hasUser: Boolean(user), draft: returnTo });
        console.log('Navigating to:', targetRoute);
        router.replace(targetRoute as any);
      });
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [router, user, loading, returnToHydrated, returnTo, rootNavigationState?.key, fadeAnim, hasNavigated]);

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