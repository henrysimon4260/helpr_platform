import { useTheme } from '@theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface DividerProps {
  text?: string;
}

export const Divider: React.FC<DividerProps> = ({ text = 'or' }) => {
  const theme = useTheme();

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: theme.spacing[4],
    },
    line: {
      flex: 1,
      height: 1,
      backgroundColor: theme.colors.borderLight,
      marginHorizontal: theme.spacing[3],
    },
    text: {
      textAlign: 'center',
      color: theme.colors.textSecondary,
      fontSize: theme.fontSizes.base,
      fontWeight: theme.fontWeights.medium,
      paddingBottom: 2,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.line} />
      <Text style={styles.text}>{text}</Text>
      <View style={styles.line} />
    </View>
  );
};
