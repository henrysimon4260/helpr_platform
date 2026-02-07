import React from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { styles } from './styles';
import { AutoCustomToggleProps } from './types';

export const AutoCustomToggle: React.FC<AutoCustomToggleProps> = ({
  isAuto,
  onToggle,
  slideAnimation,
}) => {
  return (
    <View style={styles.container}>
      <Animated.View style={styles.slider}>
        <View style={styles.icons}>
          <View style={styles.iconWrapper}>
            <Image
              source={require('../../../assets/icons/ChooseHelprIcon.png')}
              style={[styles.icon, { opacity: isAuto ? 0.5 : 1 }]}
            />
          </View>
          <View style={styles.iconWrapper}>
            <Image
              source={require('../../../assets/icons/AutoFillIcon.png')}
              style={[styles.icon, { opacity: isAuto ? 1 : 0.5, width: 17, height: 17, marginLeft: 2 }]}
            />
          </View>
        </View>
        <Pressable style={StyleSheet.absoluteFill} onPress={onToggle}>
          <Animated.View
            style={[
              styles.thumb,
              {
                transform: [
                  {
                    translateX: slideAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 32],
                    }),
                  },
                ],
              },
            ]}
          />
        </Pressable>
      </Animated.View>
      <Text style={styles.label}>
        <Text style={[styles.label, styles.title]}>{isAuto ? 'AutoFill' : 'Custom'}</Text>
        {'\n'}
        <Text style={[styles.label, styles.subtitle]}>
          {isAuto ? 'Confirm first available Helpr at this price' : 'Choose from available pros'}
        </Text>
      </Text>
    </View>
  );
};






