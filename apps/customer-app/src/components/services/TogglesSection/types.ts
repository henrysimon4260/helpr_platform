import { Animated } from 'react-native';

import { PaymentMethodInfo } from '../PersonalBusinessToggle/types';

export interface TogglesSectionProps {
  isAuto: boolean;
  onToggleAuto: () => void;
  autoAnimation: Animated.Value;
  isPersonal: boolean;
  onTogglePersonal: () => void;
  personalAnimation: Animated.Value;
  activePaymentMethod: PaymentMethodInfo | null;
  onPaymentMethodPress: () => void;
}
