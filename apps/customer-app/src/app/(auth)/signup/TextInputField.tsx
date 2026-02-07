import { useTheme } from '@theme';
import React from 'react';
import { KeyboardTypeOptions, StyleSheet, Text, TextInput, View } from 'react-native';

interface TextInputFieldProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  error?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
  editable?: boolean;
}

export const TextInputField: React.FC<TextInputFieldProps> = ({
  value,
  onChange,
  placeholder = '',
  error,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
  autoFocus = false,
  editable = true,
}) => {
  const theme = useTheme();

  const styles = StyleSheet.create({
    container: {
      marginBottom: theme.spacing[3],
    },
    input: {
      backgroundColor: theme.colors.backgroundSecondary,
      borderRadius: theme.radius.pill,
      padding: theme.spacing[4],
      paddingLeft: theme.spacing[5],
      fontSize: theme.fontSizes.md,
      color: theme.colors.textSecondary,
      ...theme.shadows.md,
    },
    inputError: {
      borderWidth: 1,
      borderColor: theme.colors.error,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: theme.fontSizes.sm,
      marginTop: theme.spacing[1],
      marginLeft: theme.spacing[5],
    },
  });

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        placeholder={placeholder}
        value={value}
        onChangeText={onChange}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        placeholderTextColor={theme.colors.textPlaceholder}
        autoFocus={autoFocus}
        editable={editable}
        autoCorrect={false}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};
