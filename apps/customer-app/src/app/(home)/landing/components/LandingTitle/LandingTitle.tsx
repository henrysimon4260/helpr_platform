import React from 'react';
import { Text } from 'react-native';

import { styles } from './styles';
import type { LandingTitleProps } from './types';

export function LandingTitle({ title, subtitle }: LandingTitleProps) {
  return (
    <>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </>
  );
}
