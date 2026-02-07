import { router } from 'expo-router';
import React from 'react';
import { Image, Pressable } from 'react-native';

import { useBackButtonStyles } from './styles';
import { BackButtonProps } from './types';

export const BackButton: React.FC<BackButtonProps> = ({ onPress }) => {
  const styles = useBackButtonStyles();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.back();
    }
  };

  return (
    <Pressable style={styles.container} onPress={handlePress}>
      <Image
        source={require('../../../assets/icons/backButton.png')}
        style={styles.icon}
      />
    </Pressable>
  );
};






