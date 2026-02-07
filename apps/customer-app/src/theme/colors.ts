/**
 * Color tokens for the Helpr app design system
 * Used across all components for consistent styling
 */

export const colors = {
  // Primary brand colors
  primary: '#0c4309',
  primaryLight: '#1a5f14',
  primaryDark: '#082d06',
  onPrimary: '#FFFFFF',

  // Secondary/accent colors
  secondary: '#cfbf9d',
  secondaryLight: '#E5DCC9',
  secondaryDark: '#8a7956',
  onSecondary: '#0c4309',

  // Background colors
  background: '#FFF8E8',
  backgroundSecondary: '#E5DCC9',
  surface: '#FFFFFF',
  surfaceElevated: '#FFF8E8',

  // Text colors
  textPrimary: '#0c4309',
  textSecondary: '#49454F',
  textTertiary: '#666666',
  textOnPrimary: '#FFFFFF',
  textPlaceholder: '#49454F',

  // Border colors
  border: '#E5DCC9',
  borderLight: '#cfbf9d',
  borderDark: '#8a7956',

  // Status colors
  success: '#0c4309',
  error: '#b02a2a',
  warning: '#f59e0b',
  info: '#3b82f6',

  // Overlay colors
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayDark: 'rgba(0, 0, 0, 0.6)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',

  // Transparent
  transparent: 'transparent',
} as const;

export type ColorToken = keyof typeof colors;
