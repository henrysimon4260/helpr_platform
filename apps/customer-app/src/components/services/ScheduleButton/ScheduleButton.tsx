import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { styles } from './styles';
import { ScheduleButtonProps } from './types';

export const ScheduleButton: React.FC<ScheduleButtonProps> = ({
  onPress,
  label = 'Schedule Helpr',
  disabled = false,
  loading = false,
}) => {
  return (
    <View style={styles.bottomRowContainer}>
      <Pressable
        onPress={onPress}
        style={[styles.container, disabled && styles.containerDisabled]}
        disabled={disabled || loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.text}>{label}</Text>
        )}
      </Pressable>
    </View>
  );
};






