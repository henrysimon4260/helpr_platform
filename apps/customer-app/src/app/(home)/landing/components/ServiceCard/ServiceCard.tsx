import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { styles } from './styles';
import type { ServiceCardProps } from './types';

export function ServiceCard({ item, onPress }: ServiceCardProps) {
  return (
    <Pressable onPress={() => onPress(item.route)} style={styles.serviceItem}>
      <View>
        <Image source={item.image} style={styles.serviceImage} />
      </View>
      <Text style={styles.serviceTitle}>{item.title}</Text>
    </Pressable>
  );
}
