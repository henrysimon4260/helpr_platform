import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { usePasswordInputStyles } from './styles';
import { PasswordInputProps, PasswordStrength } from './types';

export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChange,
  placeholder = 'Password',
  error,
  showStrength = false,
  minLength = 6,
}) => {
  const styles = usePasswordInputStyles();
  const [showPassword, setShowPassword] = useState(false);

  const getPasswordStrength = (password: string): PasswordStrength => {
    if (password.length === 0) return { label: '', color: 'transparent' };
    if (password.length < minLength) return { label: 'Too short', color: '#b02a2a' };

    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    if (strength <= 2) return { label: 'Weak', color: '#f59e0b' };
    if (strength <= 3) return { label: 'Medium', color: '#3b82f6' };
    return { label: 'Strong', color: '#0c4309' };
  };

  const strength = showStrength ? getPasswordStrength(value) : null;
  const showError = error || (value.length > 0 && value.length < minLength);

  return (
    <View style={styles.container}>
      <View style={[styles.inputContainer, showError && styles.inputError]}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!showPassword}
          placeholderTextColor={styles.placeholderColor}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={styles.toggleButton}
          onPress={() => setShowPassword(!showPassword)}
        >
          <Text style={styles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {showStrength && strength?.label && (
        <Text style={[styles.strengthText, { color: strength.color }]}>
          Password strength: {strength.label}
        </Text>
      )}
    </View>
  );
};

export default PasswordInput;
