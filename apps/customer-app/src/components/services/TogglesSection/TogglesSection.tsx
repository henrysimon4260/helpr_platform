import React from 'react';
import { View } from 'react-native';

import { AutoCustomToggle, PersonalBusinessToggle } from '..';
import { styles } from './styles';
import { TogglesSectionProps } from './types';

export const TogglesSection: React.FC<TogglesSectionProps> = ({
  isAuto,
  onToggleAuto,
  autoAnimation,
  isPersonal,
  onTogglePersonal,
  personalAnimation,
  activePaymentMethod,
  onPaymentMethodPress,
}) => (
  <View style={styles.container}>
    <AutoCustomToggle isAuto={isAuto} onToggle={onToggleAuto} slideAnimation={autoAnimation} />
    <PersonalBusinessToggle
      isPersonal={isPersonal}
      onToggle={onTogglePersonal}
      slideAnimation={personalAnimation}
      activePaymentMethod={activePaymentMethod}
      onPaymentMethodPress={onPaymentMethodPress}
    />
  </View>
);
