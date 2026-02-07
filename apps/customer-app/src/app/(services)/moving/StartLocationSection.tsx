import React from 'react';
import { Image, View } from 'react-native';

import { CurrentLocationOption, LocationAutocompleteInput, PlaceSuggestion } from './LocationAutocompleteInput';
import { styles } from './moving.styles';

type StartLocationSectionProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSelectSuggestion: (suggestion: PlaceSuggestion) => void;
  onClear: () => void;
  suggestions: PlaceSuggestion[];
  loading: boolean;
  currentLocationOption?: CurrentLocationOption;
  forceHideSuggestions?: boolean;
  onFocusInput?: () => void;
};

export const StartLocationSection: React.FC<StartLocationSectionProps> = ({
  value,
  onChangeText,
  onSelectSuggestion,
  onClear,
  suggestions,
  loading,
  currentLocationOption,
  forceHideSuggestions,
  onFocusInput,
}) => (
  <View style={[styles.locationSection, styles.locationSectionStart]}>
    <View style={styles.locationLabelRow}>
      <Image
        source={require('../../../assets/icons/ConfirmLocationIcon.png')}
        style={[styles.confirmLocationIcon, { width: 24, height: 24, resizeMode: 'contain' }]}
      />
      <LocationAutocompleteInput
        value={value}
        placeholder="Start Location"
        onChangeText={onChangeText}
        onSelectSuggestion={onSelectSuggestion}
        onClear={onClear}
        suggestions={suggestions}
        loading={loading}
        currentLocationOption={currentLocationOption}
        forceHideSuggestions={forceHideSuggestions}
        onFocusInput={onFocusInput}
      />
    </View>
  </View>
);
