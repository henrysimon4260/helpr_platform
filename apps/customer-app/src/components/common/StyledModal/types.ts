import { ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type StyledModalButton = {
  text: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  fullWidth?: boolean;
};

export interface StyledModalProps {
  visible: boolean;
  title?: string;
  message?: string;
  buttons?: StyledModalButton[];
  onRequestClose: () => void;
  allowBackdropDismiss?: boolean;
  animationType?: 'none' | 'slide' | 'fade';
  children?: ReactNode;
}






