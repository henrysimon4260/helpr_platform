import { useTheme } from '@theme';
import { StyleSheet } from 'react-native';

export const useBinarySliderStyles = () => {
  const theme = useTheme();

  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 4,
    },
    slider: {
      width: 72,
      height: 38,
      borderRadius: 21.5,
      borderWidth: 2,
      borderColor: theme.colors.primary,
      backgroundColor: 'transparent',
      padding: 2,
      justifyContent: 'center',
    },
    icons: {
      flexDirection: 'row',
      position: 'absolute',
      left: 2,
      right: 2,
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    icon: {
      width: 24,
      height: 24,
      resizeMode: 'contain',
    },
    thumb: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.colors.primary,
    },
    label: {
      marginLeft: 12,
      flex: 1,
    },
    title: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    subtitle: {
      fontSize: 11,
      fontWeight: '400',
      color: theme.colors.textSecondary,
    },
  });
};






