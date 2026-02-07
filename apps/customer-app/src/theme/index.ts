/**
 * Helpr App Theme System
 * 
 * Usage:
 * import { useTheme } from '@theme';
 * const theme = useTheme();
 * 
 * Or import individual tokens:
 * import { colors, spacing } from '@theme';
 */

import { colors } from './colors';
import { radius } from './radius';
import { shadows } from './shadows';
import { spacing } from './spacing';
import { fontSizes, fontWeights, letterSpacing, lineHeights } from './typography';

export const theme = {
  colors,
  fontSizes,
  fontWeights,
  lineHeights,
  letterSpacing,
  spacing,
  radius,
  shadows,
} as const;

export type Theme = typeof theme;

/**
 * Hook to access the theme object
 * Can be extended to support dark mode in the future
 */
export const useTheme = (): Theme => {
  return theme;
};

// Re-export individual tokens for direct imports
export { colors } from './colors';
export { radius } from './radius';
export { shadows } from './shadows';
export { spacing } from './spacing';
export { fontSizes, fontWeights, letterSpacing, lineHeights } from './typography';

// Export types
export type { ColorToken } from './colors';
export type { RadiusToken } from './radius';
export type { ShadowToken } from './shadows';
export type { SpacingToken } from './spacing';
export type { FontSizeToken, FontWeightToken } from './typography';
