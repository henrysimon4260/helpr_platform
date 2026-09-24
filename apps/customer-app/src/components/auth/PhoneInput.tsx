import React from 'react';
import { Text, TextInput, View } from 'react-native';

import { useEmailInputStyles } from './EmailInput/styles';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({ value, onChange, error }) => {
  const styles = useEmailInputStyles();

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        placeholder="Phone number"
        value={value}
        onChangeText={onChange}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        placeholderTextColor={styles.placeholderColor}
        autoCorrect={false}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};
