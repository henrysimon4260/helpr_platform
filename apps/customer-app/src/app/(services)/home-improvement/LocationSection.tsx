import React from 'react';
import { Image, View } from 'react-native';

import { LocationAutocompleteInput, CurrentLocationOption, PlaceSuggestion } from '../../../components/services/LocationAutocompleteInput';
import { styles } from './home-improvement.styles';

interface LocationSectionProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelectSuggestion: (suggestion: PlaceSuggestion) => void;
  onClear: () => void;
  suggestions: PlaceSuggestion[];
  loading: boolean;
  currentLocationOption: CurrentLocationOption;
  forceHideSuggestions?: boolean;
  onFocusInput?: () => void;
  onSuggestionsVisibilityChange?: (visible: boolean) => void;
}

export const LocationSection: React.FC<LocationSectionProps> = ({
  value,
  onChangeText,
  onSelectSuggestion,
  onClear,
  suggestions,
  loading,
  currentLocationOption,
  forceHideSuggestions,
  onFocusInput,
  onSuggestionsVisibilityChange,
}) => {
  const [isSuggestionsVisible, setIsSuggestionsVisible] = React.useState(false);

  const handleVisibilityChange = React.useCallback(
    (visible: boolean) => {
      setIsSuggestionsVisible(visible);
      onSuggestionsVisibilityChange?.(visible);
    },
    [onSuggestionsVisibilityChange],
  );

  return (
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
          placeholder="Project Location"
          onChangeText={onChangeText}
          onSelectSuggestion={onSelectSuggestion}
          onClear={onClear}
          suggestions={suggestions}
          loading={loading}
          currentLocationOption={currentLocationOption}
          onSuggestionsVisibilityChange={handleVisibilityChange}
          forceHideSuggestions={forceHideSuggestions}
          onFocusInput={onFocusInput}
        />
      </View>
    </View>
  );
};
