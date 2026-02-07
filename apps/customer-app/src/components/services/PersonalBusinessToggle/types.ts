import { Animated } from 'react-native';

export interface PaymentMethodInfo {
  brand: string;
  last4: string;
}

export interface PersonalBusinessToggleProps {
  isPersonal: boolean;
  onToggle: () => void;
  slideAnimation: Animated.Value;
  activePaymentMethod: PaymentMethodInfo | null;
  onPaymentMethodPress: () => void;
}






