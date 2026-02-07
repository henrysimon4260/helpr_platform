import { useTheme } from '@theme';
import { StyleSheet } from 'react-native';

export const usePriceDisplayStyles = () => {
  const theme = useTheme();

  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#E5DCC9',
      borderRadius: 12,
      paddingVertical: 8,
      marginTop: 5,
      marginBottom: 5,
      minHeight: 54,
    },
    textContainer: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      backgroundColor: 'transparent',
      marginRight: 80,
    },
    titleContainer: {
      flexDirection: 'row',
      backgroundColor: 'transparent',
      marginLeft: 12,
    },
    subtitleContainer: {
      flexDirection: 'row',
      backgroundColor: 'transparent',
      marginLeft: 12,
      marginTop: 2,
    },
    titleText: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    subtitleText: {
      fontSize: 12,
      fontWeight: '400',
      color: theme.colors.textSecondary,
    },
    quoteContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'transparent',
      marginRight: 8,
      paddingHorizontal: 8,
    },
    quoteText: {
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '400',
      color: theme.colors.primary,
      flexWrap: 'wrap',
    },
    quotePrice: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    quoteRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    estimateText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.primary,
      textTransform: 'lowercase',
      marginLeft: 4,
    },
    quoteTextError: {
      color: '#b02a2a',
    },
    noteText: {
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '500',
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
  });
};






