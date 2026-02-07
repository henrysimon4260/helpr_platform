import React from 'react';
import { Text, TextInput, View } from 'react-native';

import { useEmailInputStyles } from './styles';
import { EmailInputProps } from './types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EmailInput: React.FC<EmailInputProps> = ({
  value,
  onChange,
  placeholder = 'Email',
  error,
  autoFocus = false,
  editable = true,
}) => {
  const styles = useEmailInputStyles();

  const isValidEmail = (email: string): boolean => {
    if (!email.trim()) return true;
    return EMAIL_REGEX.test(email);
  };

  const showError = error || (value.length > 0 && !isValidEmail(value));
  const errorMessage = error || (showError ? 'Please enter a valid email' : undefined);

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.input, showError && styles.inputError]}
        placeholder={placeholder}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholderTextColor={styles.placeholderColor}
        autoFocus={autoFocus}
        editable={editable}
        autoCorrect={false}
      />
      {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
    </View>
  );
};

export default EmailInput;
