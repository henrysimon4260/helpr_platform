import React from 'react';
import { Text, View } from 'react-native';

import { styles } from './wall-mounting.styles';

export const WallMountingHeader: React.FC = () => (
  <View>
    <Text style={styles.title}>Wall Mounting Details</Text>
    <View style={styles.DividerContainer1}>
      <View style={styles.DividerLine1} />
    </View>
  </View>
);
