import { useTheme } from '@theme';
import { StyleSheet, TextStyle, ViewStyle } from 'react-native';

export interface LoginStyles {
  container: ViewStyle;
  titleContainer: ViewStyle;
  title: TextStyle;
  formContainer: ViewStyle;
}

export const useLoginStyles = (): LoginStyles => {
  const theme = useTheme();

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
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
    formContainer: {
      width: '100%',
    },
  });
};
