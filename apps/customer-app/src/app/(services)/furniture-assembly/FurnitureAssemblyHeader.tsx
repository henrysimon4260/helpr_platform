import React from 'react';
import { Text, View } from 'react-native';

import { styles } from './furniture-assembly.styles';

export const FurnitureAssemblyHeader: React.FC = () => (
  <View>
    <Text style={styles.title}>Furniture Assembly Details</Text>
    <View style={styles.DividerContainer1}>
      <View style={styles.DividerLine1} />
    </View>
  </View>
);
