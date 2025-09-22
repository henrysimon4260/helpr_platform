import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function RunningErrands() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Running Errands Services</Text>
      <Text style={styles.description}>
        Professional errand running services available.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
  },
});
