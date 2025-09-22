import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function CustomerServiceChat() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Customer Service Chat</Text>
      <Text style={styles.description}>
        Chat with our customer service team for support.
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
