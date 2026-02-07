import { router } from 'expo-router';
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { useSignInModalStyles } from './styles';
import { SignInModalProps } from './types';

export const SignInModal: React.FC<SignInModalProps> = ({
  visible,
  onClose,
  onSignIn,
  onSignUp,
  title = 'Sign in to continue',
  message = 'You need to be signed in to schedule a service.',
}) => {
  const styles = useSignInModalStyles();

  const handleSignIn = () => {
    onSignIn?.();
    onClose();
    router.push('/(auth)/login' as any);
  };

  const handleSignUp = () => {
    onSignUp?.();
    onClose();
    router.push('/(auth)/signup' as any);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttonsRow}>
            <Pressable style={styles.signInButton} onPress={handleSignIn}>
              <Text style={styles.signInButtonText}>Sign In</Text>
            </Pressable>
            <Pressable style={styles.signUpButton} onPress={handleSignUp}>
              <Text style={styles.signUpButtonText}>Sign Up</Text>
            </Pressable>
          </View>
          <Pressable style={styles.okButton} onPress={onClose}>
            <Text style={styles.okButtonText}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};






