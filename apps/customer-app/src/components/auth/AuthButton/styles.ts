import { useTheme } from '@theme';
import { StyleSheet } from 'react-native';

export const useAuthButtonStyles = () => {
  const theme = useTheme();

  const styles = StyleSheet.create({
    button: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.pill,
      padding: theme.spacing[4],
      alignItems: 'center',
      marginBottom: theme.spacing[4],
    },
    secondaryButton: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    disabledButton: {
      opacity: 0.6,
    },
    buttonText: {
      color: theme.colors.onPrimary,
      fontSize: theme.fontSizes.md,
      fontWeight: theme.fontWeights.bold,
    },
    secondaryButtonText: {
      color: theme.colors.primary,
    },
  });

  return {
    ...styles,
    primaryTextColor: theme.colors.onPrimary,
    secondaryTextColor: theme.colors.primary,
  };
};
