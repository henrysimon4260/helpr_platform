import { useTheme } from '@theme';
import { StyleSheet } from 'react-native';

export const useSignInModalStyles = () => {
  const theme = useTheme();

  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    content: {
      backgroundColor: theme.colors.background,
      borderRadius: 20,
      padding: 24,
      width: '85%',
      maxWidth: 340,
      alignItems: 'center',
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.primary,
      textAlign: 'center',
      marginBottom: 12,
    },
    message: {
      fontSize: 15,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 22,
    },
    buttonsRow: {
      flexDirection: 'row',
      width: '100%',
      gap: 12,
      marginBottom: 16,
    },
    signInButton: {
      flex: 1,
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    signInButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    signUpButton: {
      flex: 1,
      backgroundColor: 'transparent',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: theme.colors.primary,
    },
    signUpButtonText: {
      color: theme.colors.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    okButton: {
      backgroundColor: '#E5DCC9',
      borderRadius: 25,
      paddingVertical: 10,
      paddingHorizontal: 20,
      alignSelf: 'center',
      minWidth: 80,
      maxWidth: 120,
      justifyContent: 'center',
      alignItems: 'center',
    },
    okButtonText: {
      color: '#0c4309',
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
};






