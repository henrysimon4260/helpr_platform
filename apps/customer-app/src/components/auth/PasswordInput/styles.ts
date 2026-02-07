import { useTheme } from '@theme';
import { StyleSheet } from 'react-native';

export const usePasswordInputStyles = () => {
  const theme = useTheme();

  const styles = StyleSheet.create({
    container: {
      marginBottom: theme.spacing[4],
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.radius.pill,
      paddingLeft: theme.spacing[5],
      paddingRight: theme.spacing[3],
      ...theme.shadows.md,
    },
    inputError: {
      borderWidth: 1,
      borderColor: theme.colors.error,
    },
    input: {
      flex: 1,
      padding: theme.spacing[4],
      paddingLeft: 0,
      fontSize: theme.fontSizes.md,
      color: theme.colors.textSecondary,
    },
    toggleButton: {
      padding: theme.spacing[3],
    },
    toggleText: {
      color: theme.colors.primary,
      fontSize: theme.fontSizes.base,
      fontWeight: theme.fontWeights.medium,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: theme.fontSizes.sm,
      marginTop: theme.spacing[1],
      marginLeft: theme.spacing[5],
    },
    strengthText: {
      fontSize: theme.fontSizes.sm,
      marginTop: theme.spacing[1],
      marginLeft: theme.spacing[5],
    },
  });

  return {
    ...styles,
    placeholderColor: theme.colors.textPlaceholder,
  };
};
