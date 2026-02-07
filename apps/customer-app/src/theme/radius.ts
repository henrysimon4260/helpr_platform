/**
 * Border radius tokens for the Helpr app design system
 */

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 25,
  full: 9999,
  pill: 30,
} as const;

export type RadiusToken = keyof typeof radius;
