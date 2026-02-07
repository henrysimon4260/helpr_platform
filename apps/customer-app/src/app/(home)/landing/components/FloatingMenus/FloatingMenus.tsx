import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
// @ts-ignore - Only for native platforms
import LottieView from 'lottie-react-native';

import { styles } from './styles';
import type { FloatingMenusProps } from './types';

const helpIconSvg = `
  <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="none" stroke="#0c4309" stroke-width="2"/>
    <path d="M10 10a2 2 0 0 1 2-2c1.1 0 2 .9 2 2 0 .7-.3 1.3-.8 1.7l-.2.2c-.3.3-.5.6-.5 1" fill="none" stroke="#0c4309" stroke-width="2"/>
    <circle cx="12" cy="16" r="1" fill="#0c4309"/>
  </svg>
`;

export function FloatingMenus({
  canRenderLottie,
  lottieRef,
  helpLottieRef,
  isMenuOpen,
  isHelpMenuOpen,
  onMenuPress,
  onHelpPress,
  onCloseMenu,
  onCloseHelpMenu,
  onNavigate,
  onAccountPress,
}: FloatingMenusProps) {
  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      {/* Menu animation view (visual only, no touches) */}
      <View style={[styles.menuButton, { pointerEvents: 'none', backgroundColor: 'transparent' }]}>
        {Platform.OS === 'web' || !canRenderLottie ? (
          <Text style={[styles.menuIconTextLarge, { color: '#0c4309' }]}>☰</Text>
        ) : (
          <LottieView
            ref={lottieRef}
            source={require('../../../../../assets/animations/menuButtonAnimation.json')}
            autoPlay={false}
            loop={false}
            style={styles.lottieAnimationLarge}
          />
        )}
      </View>

      {/* Toggle hit area */}
      <Pressable onPress={onMenuPress} style={styles.menuTogglePressable} />

      {/* Help animation view (visual only, no touches) */}
      <View style={[styles.helpButton, { pointerEvents: 'none', backgroundColor: 'transparent' }]}>
        {Platform.OS === 'web' || !canRenderLottie ? (
          <SvgXml xml={helpIconSvg} width="20" height="20" />
        ) : (
          <LottieView
            ref={helpLottieRef}
            source={require('../../../../../assets/animations/helpButtonAnimation.json')}
            autoPlay={false}
            loop={false}
            style={styles.lottieAnimationLarge}
          />
        )}
      </View>

      {/* Toggle hit area */}
      <Pressable onPress={onHelpPress} style={styles.helpTogglePressable} />

      {isMenuOpen && (
        <>
          <Pressable style={styles.dismissOverlay} onPress={onCloseMenu} />
          <View style={styles.menuOverlay}>
            <View style={styles.menuContainer}>
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  onCloseMenu();
                  onNavigate('booked-services');
                }}
              >
                <View style={styles.menuItemRow}>
                  <Text style={styles.menuItemText}>Booked Services</Text>
                </View>
              </Pressable>

              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  onCloseMenu();
                  onNavigate('past-services');
                }}
              >
                <View style={styles.menuItemRow}>
                  <Text style={styles.menuItemText}>Past Services</Text>
                </View>
              </Pressable>

              <Pressable style={styles.menuItem} onPress={onAccountPress}>
                <View style={styles.menuItemRow}>
                  <Text style={styles.menuItemText}>Account</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </>
      )}

      {isHelpMenuOpen && (
        <>
          <Pressable style={styles.dismissOverlay} onPress={onCloseHelpMenu} />
          <View style={styles.helpMenuOverlay}>
            <View style={styles.helpMenuContainer}>
              <Pressable
                style={styles.helpMenuItem}
                onPress={() => {
                  onCloseHelpMenu();
                  onNavigate('customer-service-chat');
                }}
              >
                <View style={styles.menuItemRow}>
                  <Text style={styles.menuItemText}>Customer Service Chat</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </>
      )}
    </View>
  );
}



















