import React from 'react';
import { View } from 'react-native';

import { styles } from './moving.styles';

export const LocationDivider: React.FC = () => (
  <View style={styles.locationDividerContainer}>
    <View style={styles.locationDividerFill} />
    <View style={styles.locationDividerLine} />
    <View style={styles.locationDividerFill} />
  </View>
);
