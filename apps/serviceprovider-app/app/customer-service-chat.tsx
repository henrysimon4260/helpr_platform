import { View, Text, StyleSheet } from 'react-native';
import React from 'react';

export default function CustomerServiceChat() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Customer Service Chat</Text>
      <Text style={styles.subtitle}>Coming soon...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0c4309',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#49454F',
  },
});
