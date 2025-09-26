import { useRouter } from 'expo-router';
import * as SplashScreenModule from 'expo-splash-screen';
import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/contexts/AuthContext';

export default function SplashComponent() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    console.log('Splash screen - loading:', loading, 'user:', user);
    
    if (loading) return; // Wait for auth check

    const navigateAfterSplash = () => {
      const targetRoute = user ? '/landing' : '/login';
      console.log('Navigating to:', targetRoute);
      
      // Start dissolve after showing splash
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 1500, // Increased from 1000ms to 1500ms for smoother fade
        useNativeDriver: true,
      }).start(() => {
        console.log('Animation complete, navigating to:', targetRoute);
        router.replace(targetRoute);
      });
    };

    const preloadAssets = async () => {
      try {
        // Prevent auto-hiding of the splash screen
        await SplashScreenModule.preventAutoHideAsync();
        
        // Hide native splash
        await SplashScreenModule.hideAsync();
        
        // Wait for minimum splash time
        setTimeout(navigateAfterSplash, 1200);
      } catch (error) {
        console.warn('Splash screen error:', error);
        // Fallback - still navigate
        setTimeout(navigateAfterSplash, 1500);
      }
    };

    preloadAssets();
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
        { opacity: fadeAnim }
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