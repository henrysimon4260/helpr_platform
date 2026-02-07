import React, { useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useBinarySliderStyles } from './styles';
import { BinarySliderProps } from './types';

export const BinarySlider: React.FC<BinarySliderProps> = ({
  value,
  onValueChange,
  leftIcon,
  rightIcon,
  title,
  subtitle,
  leftIconStyle,
  rightIconStyle,
}) => {
  const styles = useBinarySliderStyles();
  const slideAnimation = useRef(new Animated.Value(value ? 1 : 0)).current;
  const slideAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  const handlePress = () => {
    const newValue = !value;
    onValueChange(newValue);

    slideAnimationRef.current?.stop();
    slideAnimationRef.current = Animated.spring(slideAnimation, {
      toValue: newValue ? 1 : 0,
      useNativeDriver: false,
      friction: 8,
      tension: 50,
    });
    slideAnimationRef.current.start();
  };

  return (
    <View style={styles.container}>
      <Animated.View style={styles.slider}>
        <View style={styles.icons}>
          <Image
            source={leftIcon}
            style={[styles.icon, { opacity: value ? 0.5 : 1 }, leftIconStyle]}
          />
          <Image
            source={rightIcon}
            style={[styles.icon, { opacity: value ? 1 : 0.5 }, rightIconStyle]}
          />
        </View>
        <Pressable style={StyleSheet.absoluteFill} onPress={handlePress}>
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
        <Text style={styles.title}>{title}</Text>
        {'\n'}
        <Text style={styles.subtitle}>{subtitle}</Text>
      </Text>
    </View>
  );
};






