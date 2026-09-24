import { useTheme } from '@theme';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useAuth } from '../../../context/AuthContext';
import { resolveSkipRoute } from '../../../context/guestFormDraft';
import { loadGuestFormDraft } from '../../../context/guestFormDraftStorage';

interface SkipLinkProps {
  onPress?: () => void;
}

export const SkipLink: React.FC<SkipLinkProps> = ({ onPress }) => {
  const theme = useTheme();
  const { getReturnTo, returnToHydrated } = useAuth();

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
      return;
    }

    const leave = (draft: ReturnType<typeof getReturnTo>) => {
      router.replace(resolveSkipRoute(draft) as any);
    };

    const memory = getReturnTo();
    if (returnToHydrated || memory?.path) {
      leave(memory);
      return;
    }

    void loadGuestFormDraft().then(leave).catch(() => leave(null));
  };

  return (
    <Pressable style={styles.container} onPress={handlePress}>
      <Text style={styles.text}>skip this step</Text>
    </Pressable>
  );
};
