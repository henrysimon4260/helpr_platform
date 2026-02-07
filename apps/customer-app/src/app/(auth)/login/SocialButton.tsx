import { useTheme } from '@theme';
import React from 'react';
import { ActivityIndicator, Image, ImageStyle, Pressable, StyleSheet, Text } from 'react-native';

type SocialProvider = 'google' | 'apple';

interface SocialButtonProps {
  provider: SocialProvider;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

interface ProviderConfig {
  label: string;
  icon: any;
  iconStyle?: ImageStyle;
}

const providerConfig: Record<SocialProvider, ProviderConfig> = {
  google: {
    label: 'Continue with Google',
    icon: require('../../../assets/icons/google-icon.png'),
  },
  apple: {
    label: 'Continue with Apple',
    icon: require('../../../assets/icons/apple-icon.png'),
    iconStyle: { marginTop: -4 },
  },
};

export const SocialButton: React.FC<SocialButtonProps> = ({
  provider,
  onPress,
  loading = false,
  disabled = false,
}) => {
  const theme = useTheme();
  const config = providerConfig[provider];
  const isDisabled = loading || disabled;

  const styles = StyleSheet.create({
    button: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.pill,
      padding: theme.spacing[4],
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: theme.spacing[4],
    },
    disabledButton: {
      opacity: 0.6,
    },
    icon: {
      width: 20,
      height: 20,
      marginRight: theme.spacing[3],
      backgroundColor: 'transparent',
    },
    appleIcon: {
      width: 24,
      height: 24,
      marginRight: theme.spacing[3],
      backgroundColor: 'transparent',
    },
    buttonText: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSizes.md,
      fontWeight: theme.fontWeights.medium,
    },
  });

  return (
    <Pressable
      style={[styles.button, isDisabled && styles.disabledButton]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.textSecondary} />
      ) : (
        <>
          <Image
            source={config.icon}
            style={[provider === 'apple' ? styles.appleIcon : styles.icon, config.iconStyle]}
            resizeMode="contain"
          />
          <Text style={styles.buttonText}>{config.label}</Text>
        </>
      )}
    </Pressable>
  );
};
