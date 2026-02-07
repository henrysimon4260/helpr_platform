import React from 'react';
import { Text, View } from 'react-native';

import { styles } from './moving.styles';

export const MovingHeader: React.FC = () => (
  <View>
    <Text style={styles.title}>Moving Details</Text>
    <View style={styles.DividerContainer1}>
      <View style={styles.DividerLine1} />
    </View>
  </View>
);
