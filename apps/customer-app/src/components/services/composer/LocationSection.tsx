import React, { useState } from 'react';
import { Image, ImageSourcePropType, View } from 'react-native';

import { CurrentLocationOption, LocationAutocompleteInput, PlaceSuggestion } from './LocationAutocompleteInput';
import { styles } from './styles';

type LocationSectionVariant = 'start' | 'end' | 'single';

type LocationSectionProps = {
  variant: LocationSectionVariant;
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
  onSelectSuggestion: (suggestion: PlaceSuggestion) => void;
  onClear: () => void;
  suggestions: PlaceSuggestion[];
  loading: boolean;
  currentLocationOption?: CurrentLocationOption;
  forceHideSuggestions?: boolean;
  onFocusInput?: () => void;
};

const ICONS: Record<LocationSectionVariant, ImageSourcePropType> = {
  start: require('../../../assets/icons/ConfirmLocationIcon.png'),
  single: require('../../../assets/icons/ConfirmLocationIcon.png'),
  end: require('../../../assets/icons/finish-flag.png'),
};

export const LocationSection: React.FC<LocationSectionProps> = ({
  variant,
  value,
  placeholder,
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
  const isEnd = variant === 'end';
  const iconStyle = isEnd
    ? [styles.confirmLocationIcon2, { width: 18, height: 18, resizeMode: 'contain' as const }]
    : [styles.confirmLocationIcon, { width: 24, height: 24, resizeMode: 'contain' as const }];

  return (
    <View
      style={[
        variant === 'single' ? styles.locationSectionSingle : isEnd ? styles.locationSection2 : styles.locationSection,
        variant === 'start' && styles.locationSectionStart,
        isEnd && styles.locationSectionEnd,
        isEnd && isSuggestionsVisible && styles.locationSectionEndDropdownVisible,
      ]}
    >
      <View style={styles.locationLabelRow}>
        <Image source={ICONS[variant]} style={iconStyle} />
        <LocationAutocompleteInput
          value={value}
          placeholder={placeholder}
          onChangeText={onChangeText}
          onSelectSuggestion={onSelectSuggestion}
          onClear={onClear}
          suggestions={suggestions}
          loading={loading}
          currentLocationOption={currentLocationOption}
          forceHideSuggestions={forceHideSuggestions}
          onFocusInput={onFocusInput}
          onSuggestionsVisibilityChange={isEnd ? setIsSuggestionsVisible : undefined}
        />
      </View>
    </View>
  );
};
