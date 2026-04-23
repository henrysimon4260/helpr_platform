import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, View } from 'react-native';

import { styles } from './styles';
import { LocationAutocompleteInputProps } from './types';

export const LocationAutocompleteInput = React.memo(
  React.forwardRef<TextInput, LocationAutocompleteInputProps>(
    (
      {
        value,
        placeholder,
        onChangeText,
        onSelectSuggestion,
        onClear,
        suggestions,
        loading,
        currentLocationOption,
        onSuggestionsVisibilityChange,
        forceHideSuggestions = false,
        onFocusInput,
      },
      ref
    ) => {
      const [isFocused, setIsFocused] = useState(false);
      const [hasUserTyped, setHasUserTyped] = useState(false);
      const hasInput = value.trim().length > 0;
      const shouldShowSuggestions =
        !forceHideSuggestions &&
        isFocused &&
        hasInput &&
        hasUserTyped &&
        (loading || suggestions.length > 0);

      useEffect(() => {
        if (onSuggestionsVisibilityChange) {
          onSuggestionsVisibilityChange(shouldShowSuggestions);
        }
      }, [onSuggestionsVisibilityChange, shouldShowSuggestions]);

      const handleChangeText = (text: string) => {
        setHasUserTyped(true);
        onChangeText(text);
      };

      return (
        <View style={styles.wrapper}>
          <View style={styles.inputRow}>
            <TextInput
              ref={ref}
              value={value}
              onChangeText={handleChangeText}
              placeholder={placeholder}
              placeholderTextColor="#7C7160"
              style={styles.input}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel={placeholder}
              onFocus={() => {
                setIsFocused(true);
                onFocusInput?.();
              }}
              onBlur={() => {
                setIsFocused(false);
                setHasUserTyped(false);
              }}
            />
            {value.length > 0 && (
              <Pressable
                onPress={onClear}
                accessibilityLabel={`Clear ${placeholder}`}
                style={styles.clearButton}
              >
                <Text style={styles.clearButtonText}>×</Text>
              </Pressable>
            )}
          </View>
          {shouldShowSuggestions && (
            <View style={styles.suggestions}>
              {loading ? (
                <View
                  style={[
                    styles.suggestion,
                    styles.loadingRow,
                    !(Boolean(currentLocationOption) || suggestions.length > 0) && styles.suggestionLast,
                  ]}
                >
                  <ActivityIndicator size="small" color="#0c4309" />
                  <Text style={styles.loadingText}>Searching...</Text>
                </View>
              ) : null}
              {loading && (Boolean(currentLocationOption) || suggestions.length > 0) ? (
                <View style={styles.divider} />
              ) : null}
              {currentLocationOption ? (
                <Pressable
                  key={currentLocationOption.id}
                  style={[
                    styles.suggestion,
                    styles.suggestionCurrent,
                    !(suggestions.length > 0) && styles.suggestionLast,
                    currentLocationOption.disabled && styles.suggestionDisabled,
                  ]}
                  accessibilityLabel={`${currentLocationOption.primaryText}${
                    currentLocationOption.secondaryText ? `, ${currentLocationOption.secondaryText}` : ''
                  }`}
                  disabled={currentLocationOption.disabled}
                  onPress={() => {
                    if (currentLocationOption.disabled) {
                      return;
                    }
                    setIsFocused(false);
                    Keyboard.dismiss();
                    currentLocationOption.onSelect();
                  }}
                >
                  <View style={styles.currentLocationTextWrapper}>
                    <Text style={styles.suggestionPrimary}>{currentLocationOption.primaryText}</Text>
                    {currentLocationOption.secondaryText ? (
                      <Text style={styles.suggestionSecondary} numberOfLines={2}>
                        {currentLocationOption.secondaryText}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ) : null}
              {currentLocationOption && suggestions.length > 0 ? <View style={styles.divider} /> : null}
              {suggestions.map((suggestion, index) => (
                <Pressable
                  key={suggestion.id}
                  style={[styles.suggestion, index === suggestions.length - 1 && styles.suggestionLast]}
                  onPress={() => {
                    setIsFocused(false);
                    Keyboard.dismiss();
                    onSelectSuggestion(suggestion);
                  }}
                >
                  <Text style={styles.suggestionPrimary}>{suggestion.primaryText}</Text>
                  {suggestion.secondaryText ? (
                    <Text style={styles.suggestionSecondary}>{suggestion.secondaryText}</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      );
    }
  )
);

LocationAutocompleteInput.displayName = 'LocationAutocompleteInput';
