import { useTheme } from '@theme';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

interface SkipLinkProps {
  onPress?: () => void;
}

export const SkipLink: React.FC<SkipLinkProps> = ({ onPress }) => {
  const theme = useTheme();

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: theme.spacing[8],
    },
    text: {
      color: theme.colors.primary,
      fontSize: theme.fontSizes.md,
      fontWeight: theme.fontWeights.medium,
    },
  });

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.replace('/(home)/landing' as any);
    }
  };

  return (
    <Pressable style={styles.container} onPress={handlePress}>
      <Text style={styles.text}>skip this step</Text>
    </Pressable>
  );
};
