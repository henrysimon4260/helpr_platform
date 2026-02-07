import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export type PlaceSuggestion = {
  id: string;
  placeId: string;
  primaryText: string;
  secondaryText?: string;
  description: string;
};

export type CurrentLocationOption = {
  id: string;
  primaryText: string;
  secondaryText?: string;
  onSelect: () => void;
  loading: boolean;
  disabled?: boolean;
};

export interface LocationAutocompleteInputProps {
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
  onSelectSuggestion: (suggestion: PlaceSuggestion) => void;
  onClear: () => void;
  suggestions: PlaceSuggestion[];
  loading: boolean;
  currentLocationOption?: CurrentLocationOption;
  onSuggestionsVisibilityChange?: (visible: boolean) => void;
  forceHideSuggestions?: boolean;
  onFocusInput?: () => void;
}

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

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    position: 'relative',
    zIndex: 100,
    marginLeft: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333333',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
  },
  clearButtonText: {
    fontSize: 18,
    color: '#7C7160',
    fontWeight: '500',
  },
  suggestions: {
    position: 'absolute',
    top: '100%',
    left: -42,
    right: 0,
    backgroundColor: '#E5DCC9',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderWidth: 0,
    zIndex: 1000,
    marginTop: 0,
    overflow: 'hidden',
  },
  suggestion: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#cfbf9dff',
  },
  suggestionLast: {
    borderBottomWidth: 0,
  },
  suggestionCurrent: {
    backgroundColor: '#E5DCC9',
    borderBottomWidth: 0,
  },
  suggestionDisabled: {
    opacity: 0.5,
  },
  suggestionPrimary: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333333',
  },
  suggestionSecondary: {
    fontSize: 13,
    color: '#7C7160',
    marginTop: 2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 0,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#7C7160',
  },
  divider: {
    height: 1,
    backgroundColor: '#cfbf9dff',
  },
  currentLocationTextWrapper: {
    flex: 1,
  },
});






