import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function PastServices() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Past Services</Text>
      <Text style={styles.description}>
        View your previously booked services.
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
