import React, { useState } from 'react';
import { Image, View } from 'react-native';

import { CurrentLocationOption, LocationAutocompleteInput, PlaceSuggestion } from '../../../components/services/LocationAutocompleteInput';
import { styles } from './moving.styles';

type EndLocationSectionProps = {
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

export const EndLocationSection: React.FC<EndLocationSectionProps> = ({
  value,
  onChangeText,
  onSelectSuggestion,
  onClear,
  suggestions,
  loading,
  currentLocationOption,
  forceHideSuggestions,
  onFocusInput,
}) => {
  const [isSuggestionsVisible, setIsSuggestionsVisible] = useState(false);

  return (
    <View style={[
      styles.locationSection2,
      styles.locationSectionEnd,
      isSuggestionsVisible && styles.locationSectionEndDropdownVisible,
    ]}>
      <View style={styles.locationLabelRow}>
        <Image
          source={require('../../../assets/icons/finish-flag.png')}
          style={[styles.confirmLocationIcon2, { width: 18, height: 18, resizeMode: 'contain' }]}
        />
        <LocationAutocompleteInput
          value={value}
          placeholder="End Location"
          onChangeText={onChangeText}
          onSelectSuggestion={onSelectSuggestion}
          onClear={onClear}
          suggestions={suggestions}
          loading={loading}
          currentLocationOption={currentLocationOption}
          forceHideSuggestions={forceHideSuggestions}
          onFocusInput={onFocusInput}
          onSuggestionsVisibilityChange={setIsSuggestionsVisible}
        />
      </View>
    </View>
  );
};
