import React from 'react';
import { Image, View } from 'react-native';

import { LocationAutocompleteInput } from '../../../components/services/LocationAutocompleteInput';
import { CurrentLocationOption, PlaceSuggestion } from '../../../components/services/LocationAutocompleteInput/types';
import { styles } from './wall-mounting.styles';

interface LocationSectionProps {
  locationQuery: string;
  suggestions: PlaceSuggestion[];
  loading: boolean;
  currentLocationOption: CurrentLocationOption;
  isSuggestionsVisible: boolean;
  onChangeText: (text: string) => void;
  onSelectSuggestion: (suggestion: PlaceSuggestion) => void;
  onClear: () => void;
  onSuggestionsVisibilityChange: (visible: boolean) => void;
}

export const LocationSection: React.FC<LocationSectionProps> = ({
  locationQuery,
  suggestions,
  loading,
  currentLocationOption,
  isSuggestionsVisible,
  onChangeText,
  onSelectSuggestion,
  onClear,
  onSuggestionsVisibilityChange,
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
        value={locationQuery}
        placeholder="Mounting Location"
        onChangeText={onChangeText}
        onSelectSuggestion={onSelectSuggestion}
        onClear={onClear}
        suggestions={suggestions}
        loading={loading}
        currentLocationOption={currentLocationOption}
        onSuggestionsVisibilityChange={onSuggestionsVisibilityChange}
      />
    </View>
  </View>
);
