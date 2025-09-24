import { router } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

export default function Account() {
  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.push('/landing')}>
              <Image 
                source={require('../assets/icons/backButton.png')} 
                style={styles.backButtonIcon} 
              />
            </Pressable>
      <Text style={styles.title}>Account</Text>
      <Text style={styles.description}>
        Manage your account settings and preferences.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#E5DCC9',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '500',
    
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 58, // Moved up to align with header text
    left: 30,
    zIndex: 10,
  },
  backButtonIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
});
