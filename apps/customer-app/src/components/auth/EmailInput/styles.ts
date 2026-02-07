import { useTheme } from '@theme';
import { StyleSheet } from 'react-native';

export const useEmailInputStyles = () => {
  const theme = useTheme();

  const styles = StyleSheet.create({
    container: {
      marginBottom: theme.spacing[4],
    },
    input: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.radius.pill,
      padding: theme.spacing[4],
      paddingLeft: theme.spacing[5],
      fontSize: theme.fontSizes.md,
      color: theme.colors.textSecondary,
      ...theme.shadows.md,
    },
    inputError: {
      borderWidth: 1,
      borderColor: theme.colors.error,
    },
    errorText: {
      color: theme.colors.error,
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
