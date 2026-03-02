import React from 'react';
import { Image, View } from 'react-native';

import { CurrentLocationOption, LocationAutocompleteInput, PlaceSuggestion } from '../../../components/services/LocationAutocompleteInput';
import { styles } from './cleaning.styles';

type LocationSectionProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSelectSuggestion: (suggestion: PlaceSuggestion) => void;
  onClear: () => void;
  suggestions: PlaceSuggestion[];
  loading: boolean;
  currentLocationOption?: CurrentLocationOption;
  isSuggestionsVisible: boolean;
  onSuggestionsVisibilityChange?: (visible: boolean) => void;
  forceHideSuggestions?: boolean;
  onFocusInput?: () => void;
};

export const LocationSection: React.FC<LocationSectionProps> = ({
  value,
  onChangeText,
  onSelectSuggestion,
  onClear,
  suggestions,
  loading,
  currentLocationOption,
  isSuggestionsVisible,
  onSuggestionsVisibilityChange,
  forceHideSuggestions,
  onFocusInput,
}) => (
  <View
    style={[
      styles.locationSection,
      styles.locationSectionStart,
      isSuggestionsVisible ? styles.locationSectionDropdownVisible : null,
    ]}
  >
    <View style={styles.locationLabelRow}>
      <Image
        source={require('../../../assets/icons/ConfirmLocationIcon.png')}
        style={[styles.confirmLocationIcon, { width: 24, height: 24, resizeMode: 'contain' }]}
      />
      <LocationAutocompleteInput
        value={value}
        placeholder="Cleaning Location"
        onChangeText={onChangeText}
        onSelectSuggestion={onSelectSuggestion}
        onClear={onClear}
        suggestions={suggestions}
        loading={loading}
        currentLocationOption={currentLocationOption}
        onSuggestionsVisibilityChange={onSuggestionsVisibilityChange}
        forceHideSuggestions={forceHideSuggestions}
        onFocusInput={onFocusInput}
      />
    </View>
  </View>
);
