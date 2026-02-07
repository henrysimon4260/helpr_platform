import React from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { styles } from './styles';
import { PersonalBusinessToggleProps } from './types';

export const PersonalBusinessToggle: React.FC<PersonalBusinessToggleProps> = ({
  isPersonal,
  onToggle,
  slideAnimation,
  activePaymentMethod,
  onPaymentMethodPress,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        <Animated.View style={styles.slider}>
          <View style={styles.icons}>
            <View style={styles.iconWrapper}>
              <Image
                source={require('../../../assets/icons/PersonalPMIcon.png')}
                style={styles.personalIcon}
              />
            </View>
            <View style={styles.iconWrapper}>
              <Image
                source={require('../../../assets/icons/BusinessPMIcon.png')}
                style={styles.businessIcon}
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
          <Text style={[styles.label, styles.title]}>{isPersonal ? 'Personal' : 'Business'}</Text>
          {'\n'}
          <Text style={[styles.label, styles.subtitle]}>
            {activePaymentMethod
              ? `${activePaymentMethod.brand} •••• ${activePaymentMethod.last4}`
              : 'Add payment method'}
          </Text>
        </Text>
      </View>
      <Pressable style={styles.editPaymentButton} onPress={onPaymentMethodPress}>
        <Text style={styles.editPaymentButtonText}>change</Text>
      </Pressable>
    </View>
  );
};






