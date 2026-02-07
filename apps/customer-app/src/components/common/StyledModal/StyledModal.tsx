import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { getButtonStyle, getButtonTextStyle, styles } from './styles';
import { StyledModalButton, StyledModalProps } from './types';

export const StyledModal: React.FC<StyledModalProps> = ({
  visible,
  title,
  message,
  buttons = [{ text: 'OK', variant: 'primary' }],
  onRequestClose,
  allowBackdropDismiss = true,
  animationType = 'fade',
  children,
}) => {
  const handleBackdropPress = () => {
    if (allowBackdropDismiss) {
      onRequestClose();
    }
  };

  const handleButtonPress = (button: StyledModalButton) => {
    button.onPress?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={onRequestClose}
    >
      <Pressable style={styles.overlay} onPress={handleBackdropPress}>
        <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
          {title && <Text style={styles.title}>{title}</Text>}
          {message && <Text style={styles.message}>{message}</Text>}
          {children}

          <View style={styles.buttonContainer}>
            {buttons.map((button, index) => (
              <Pressable
                key={index}
                style={[
                  getButtonStyle(button.variant, button.fullWidth),
                  button.disabled && styles.disabledButton,
                ]}
                onPress={() => handleButtonPress(button)}
                disabled={button.disabled}
              >
                <Text style={[styles.buttonText, getButtonTextStyle(button.variant, button.fullWidth)]}>
                  {button.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};






