import React from 'react';
import { Text, View } from 'react-native';

import { styles } from './home-improvement.styles';

export const HomeImprovementHeader: React.FC = () => (
  <View>
    <Text style={styles.title}>Home Improvement Details</Text>
    <View style={styles.DividerContainer1}>
      <View style={styles.DividerLine1} />
    </View>
  </View>
);
