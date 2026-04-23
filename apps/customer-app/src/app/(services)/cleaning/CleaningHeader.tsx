import React from 'react';
import { Text, View } from 'react-native';

import { styles } from './cleaning.styles';

export const CleaningHeader: React.FC = () => (
  <View>
    <Text style={styles.title}>Cleaning Details</Text>
    <View style={styles.DividerContainer1}>
      <View style={styles.DividerLine1} />
    </View>
  </View>
);
