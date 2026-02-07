import React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { useAuthButtonStyles } from './styles';
import { AuthButtonProps } from './types';

export const AuthButton: React.FC<AuthButtonProps> = ({
  title,
  onPress,
  loading = false,
  disabled = false,
  secondary = false,
}) => {
  const styles = useAuthButtonStyles();
  const isDisabled = loading || disabled;

  return (
    <Pressable
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        isDisabled && styles.disabledButton,
      ]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? styles.secondaryTextColor : styles.primaryTextColor} />
      ) : (
        <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{title}</Text>
      )}
    </Pressable>
  );
};

export default AuthButton;
