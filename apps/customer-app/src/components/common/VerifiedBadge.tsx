import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function VerifiedBadge() {
  return (
    <View style={styles.badge} accessibilityRole="text" accessibilityLabel="Verified background check">
      <Text style={styles.text}>Verified</Text>
    </View>
  );
}

export function isCheckrClearStatus(status: unknown): boolean {
  return typeof status === 'string' && status.trim().toLowerCase() === 'clear';
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#0c4309',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: {
    color: '#FFF8E8',
    fontSize: 11,
    fontWeight: '700',
  },
});
