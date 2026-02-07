import React from 'react';
import { Pressable, Text } from 'react-native';

import { styles } from './styles';
import type { CustomServiceCTAProps } from './types';

export function CustomServiceCTA({ hintText, buttonText, onPress }: CustomServiceCTAProps) {
  return (
    <>
      <Text style={styles.hint}>{hintText}</Text>
      <Pressable style={styles.button} onPress={onPress}>
        <Text style={styles.buttonText}>{buttonText}</Text>
      </Pressable>
    </>
  );
}
