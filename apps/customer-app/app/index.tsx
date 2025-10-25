import { useRouter } from 'expo-router';
import * as SplashScreenModule from 'expo-splash-screen';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/contexts/AuthContext';

export default function SplashComponent() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    console.log('Splash screen - loading:', loading, 'user:', user);

    if (loading) return; // Wait for auth check

    const HOLD_DURATION = 800;
    const DISSOLVE_DURATION = 1400;
    const easingCurve = Easing.bezier(0.22, 1, 0.36, 1); // smooth, ease-out style curve

    let dissolveAnimation: Animated.CompositeAnimation | null = null;

    const navigateAfterSplash = () => {
      const targetRoute = user ? '/landing' : '/login';
      console.log('Navigating to:', targetRoute);

      dissolveAnimation = Animated.sequence([
        Animated.delay(HOLD_DURATION),
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: DISSOLVE_DURATION,
            easing: easingCurve,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 0.95,
            duration: DISSOLVE_DURATION,
            easing: easingCurve,
            useNativeDriver: true,
          }),
        ]),
      ]);

      dissolveAnimation.start(({ finished }) => {
        if (finished) {
          console.log('Animation complete, navigating to:', targetRoute);
          router.replace(targetRoute);
        }
      });
    };

    const preloadAssets = async () => {
      try {
        await SplashScreenModule.preventAutoHideAsync();
        await SplashScreenModule.hideAsync();

        fadeAnim.setValue(1);
        scaleAnim.setValue(1);
        navigateAfterSplash();
      } catch (error) {
        console.warn('Splash screen error:', error);
        fadeAnim.setValue(1);
        scaleAnim.setValue(1);
        navigateAfterSplash();
      }
    };

    preloadAssets();

    return () => {
      dissolveAnimation?.stop?.();
    };
  }, [router, fadeAnim, user, loading]);

  return (
    <View style={styles.container}>
      {/* Static background that matches your landing screen */}
      <View style={styles.landingBackground}>
        {/* Add any static elements that match your landing screen here */}
        <View style={styles.staticContent}>
          {/* This creates visual continuity */}
        </View>
      </View>
      
      {/* Splash overlay that dissolves */}
      <Animated.View style={[
        styles.splashOverlay,
        { 
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }]
        }
      ]}>
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
    backgroundColor: '#0c4309', // Match your landing background
  },
  landingBackground: {
    flex: 1,
    backgroundColor: '#0c4309', // Same as landing screen
  },
  staticContent: {
    flex: 1,
    // Add styles that match your landing screen layout
  },
  splashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  splashImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});