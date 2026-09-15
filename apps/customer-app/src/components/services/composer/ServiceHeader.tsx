import React from 'react';
import { Text, View } from 'react-native';

import { styles } from './styles';

export const ServiceHeader: React.FC<{ title: string }> = ({ title }) => (
  <View>
    <Text style={styles.title}>{title}</Text>
    <View style={styles.DividerContainer1}>
      <View style={styles.DividerLine1} />
    </View>
  </View>
);
