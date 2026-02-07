import { useTheme } from '@theme';
import { StyleSheet, TextStyle, ViewStyle } from 'react-native';

export interface SignupStyles {
  container: ViewStyle;
  scrollContainer: ViewStyle;
  titleContainer: ViewStyle;
  title: TextStyle;
  formContainer: ViewStyle;
}

export const useSignupStyles = (): SignupStyles => {
  const theme = useTheme();

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContainer: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: theme.spacing[5],
    },
    titleContainer: {
      marginVertical: theme.spacing[4],
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: theme.spacing[16],
      marginBottom: theme.spacing[4],
    },
    title: {
      fontSize: theme.fontSizes['3xl'],
      fontWeight: theme.fontWeights.bold,
      color: theme.colors.primary,
      letterSpacing: theme.letterSpacing.wide,
    },
    formContainer: {
      width: '100%',
    },
  });
};
