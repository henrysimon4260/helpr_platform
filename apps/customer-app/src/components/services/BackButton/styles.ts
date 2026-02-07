import { useTheme } from '@theme';
import { StyleSheet } from 'react-native';

export const useBackButtonStyles = () => {
  const theme = useTheme();

  return StyleSheet.create({
    container: {
      position: 'absolute',
      top: 60,
      left: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 4,
      zIndex: 10,
    },
    icon: {
      width: 48,
      height: 48,
      resizeMode: 'contain',
    },
  });
};






