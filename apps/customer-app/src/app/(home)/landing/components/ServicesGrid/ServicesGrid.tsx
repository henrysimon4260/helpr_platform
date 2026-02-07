import React from 'react';
import { FlatList, ListRenderItemInfo, View } from 'react-native';

import type { LandingServiceItem } from '../../landing.types';
import { ServiceCard } from '../ServiceCard';
import { styles } from './styles';
import type { ServicesGridProps } from './types';

export function ServicesGrid({ services, onPressService }: ServicesGridProps) {
  const renderItem = ({ item }: ListRenderItemInfo<LandingServiceItem>) => (
    <ServiceCard item={item} onPress={onPressService} />
  );

  return (
    <View style={styles.servicesWrapper}>
      <FlatList
        data={services}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={3}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        scrollEnabled={false}
      />
    </View>
  );
}
