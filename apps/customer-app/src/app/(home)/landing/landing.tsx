import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
    Animated,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    View,
} from 'react-native';

import { CustomServiceCTA } from './components/CustomServiceCTA';
import { FloatingMenus } from './components/FloatingMenus';
import { LandingTitle } from './components/LandingTitle';
import { ServicesGrid } from './components/ServicesGrid';
import { useLandingScreen } from './landing.hooks';
import { styles } from './landing.styles';

export default function LandingScreen() {
  const {
    fadeAnim,
    canRenderLottie,
    lottieRef,
    helpLottieRef,
    isMenuOpen,
    isHelpMenuOpen,
    navigate,
    handleAccountPress,
    handleMenuPress,
    handleHelpPress,
    closeMenu,
    closeHelpMenu,
    services,
  } = useLandingScreen();

  return (
    <View style={styles.screen}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <Animated.View style={[styles.fadeContainer, { opacity: fadeAnim }]}>
          <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
          >
            <StatusBar style="dark" backgroundColor="#0c4309" />

            <LandingLayout>
              <LandingTitle title="What can we help with?" subtitle="Popular Services" />
              <ServicesGrid services={services} onPressService={navigate} />
              <CustomServiceCTA
                hintText="don’t see what you need?"
                buttonText="Make A Custom Service"
                onPress={() => navigate('custom-service')}
              />
            </LandingLayout>

            {/* Screen-wide overlay, outside the padded container (true screen edges) */}
            <View pointerEvents="box-none" style={styles.overlay}>
              <FloatingMenus
                canRenderLottie={canRenderLottie}
                lottieRef={lottieRef}
                helpLottieRef={helpLottieRef}
                isMenuOpen={isMenuOpen}
                isHelpMenuOpen={isHelpMenuOpen}
                onMenuPress={handleMenuPress}
                onHelpPress={handleHelpPress}
                onCloseMenu={closeMenu}
                onCloseHelpMenu={closeHelpMenu}
                onNavigate={navigate}
                onAccountPress={handleAccountPress}
              />
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </TouchableWithoutFeedback>
    </View>
  );
}

function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.container}>
      <View style={styles.contentArea}>{children}</View>
    </View>
  );
}
