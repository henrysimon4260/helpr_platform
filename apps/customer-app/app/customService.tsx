import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function CustomService() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Custom Service</Text>
      {/* Add your custom service form or content here */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0c4309',
    marginBottom: 20,
  },
});
