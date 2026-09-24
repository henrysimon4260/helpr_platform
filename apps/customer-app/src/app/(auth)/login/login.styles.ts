import { useTheme } from '@theme';
import { StyleSheet, TextStyle, ViewStyle } from 'react-native';

export interface LoginStyles {
  container: ViewStyle;
  scrollContent: ViewStyle;
  titleContainer: ViewStyle;
  title: TextStyle;
  subtitle: TextStyle;
  hint: TextStyle;
  formContainer: ViewStyle;
  linkRow: ViewStyle;
  link: TextStyle;
}

export const useLoginStyles = (): LoginStyles => {
  const theme = useTheme();

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: theme.spacing[6],
    },
    titleContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: theme.spacing[9],
    },
    title: {
      fontSize: theme.fontSizes['3xl'],
      fontWeight: theme.fontWeights.bold,
      color: theme.colors.primary,
    },
    subtitle: {
      textAlign: 'center',
      color: theme.colors.textSecondary,
      fontSize: theme.fontSizes.md,
      marginTop: -theme.spacing[6],
      marginBottom: theme.spacing[6],
    },
    hint: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSizes.sm,
      marginTop: -theme.spacing[2],
      marginBottom: theme.spacing[4],
      marginLeft: theme.spacing[5],
    },
    formContainer: {
      width: '100%',
    },
    linkRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      flexWrap: 'wrap',
      marginBottom: theme.spacing[4],
    },
    link: {
      color: theme.colors.primary,
      fontSize: theme.fontSizes.sm,
      fontWeight: theme.fontWeights.medium,
      marginHorizontal: theme.spacing[2],
      marginBottom: theme.spacing[2],
    },
  });
};
