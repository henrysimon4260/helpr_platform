import { useTheme } from '@theme';
import { StyleSheet } from 'react-native';

export const useOTPModalStyles = () => {
  const theme = useTheme();

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: theme.colors.overlayDark,
      justifyContent: 'center',
      alignItems: 'center',
    },
    content: {
      backgroundColor: theme.colors.background,
      borderRadius: theme.radius['3xl'],
      padding: theme.spacing[8],
      width: '90%',
      alignItems: 'center',
      ...theme.shadows.modal,
    },
    title: {
      fontSize: theme.fontSizes['3xl'],
      fontWeight: theme.fontWeights.bold,
      color: theme.colors.primary,
      marginBottom: theme.spacing[3],
      textAlign: 'center',
      letterSpacing: theme.letterSpacing.wide,
    },
    subtitle: {
      fontSize: theme.fontSizes.md,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: theme.spacing[6],
      lineHeight: 22,
    },
    otpInput: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.radius['2xl'],
      padding: theme.spacing[5],
      marginBottom: theme.spacing[5],
      fontSize: theme.fontSizes['2xl'],
      textAlign: 'center',
      letterSpacing: 3,
      fontWeight: theme.fontWeights.bold,
      color: theme.colors.primary,
      width: '100%',
      ...theme.shadows.md,
    },
    verifyButton: {
      borderRadius: theme.radius['2xl'],
      padding: theme.spacing[4] + 2,
      alignItems: 'center',
      marginBottom: theme.spacing[4],
      width: '100%',
      ...theme.shadows.lg,
    },
    buttonActive: {
      backgroundColor: theme.colors.primary,
    },
    buttonInactive: {
      backgroundColor: `${theme.colors.primary}95`,
    },
    verifyButtonText: {
      color: theme.colors.onPrimary,
      fontSize: theme.fontSizes.lg,
      fontWeight: theme.fontWeights.bold,
      letterSpacing: theme.letterSpacing.wide,
    },
    resendButton: {
      backgroundColor: 'transparent',
      padding: theme.spacing[3],
      marginBottom: theme.spacing[3],
    },
    resendButtonText: {
      color: theme.colors.primary,
      fontSize: theme.fontSizes.md,
      textDecorationLine: 'underline',
      fontWeight: theme.fontWeights.medium,
    },
    cancelButton: {
      backgroundColor: theme.colors.secondary,
      borderRadius: theme.radius['2xl'],
      padding: theme.spacing[3],
      alignItems: 'center',
      marginBottom: theme.spacing[3],
      width: '60%',
      ...theme.shadows.md,
    },
    cancelButtonText: {
      color: theme.colors.onPrimary,
      fontSize: theme.fontSizes.md,
      fontWeight: theme.fontWeights.semibold,
    },
  });

  return {
    ...styles,
    placeholderColor: theme.colors.textPlaceholder,
  };
};
