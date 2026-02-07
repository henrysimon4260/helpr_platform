import { StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { ButtonVariant } from './types';

export const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    backgroundColor: '#FFF8E8',
    borderRadius: 20,
    padding: 16,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0c4309',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#49454F',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  buttonContainer: {
    flexDirection: 'column',
    gap: 12,
    marginTop: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
});

export const getButtonStyle = (variant?: ButtonVariant, fullWidth?: boolean): ViewStyle => {
  const baseStyle: ViewStyle = {
    borderRadius: fullWidth ? 12 : 25,
    paddingVertical: fullWidth ? 14 : 10,
    paddingHorizontal: fullWidth ? 14 : 20,
    alignItems: 'center',
    justifyContent: 'center',
    flex: fullWidth ? 1 : undefined,
    minWidth: fullWidth ? undefined : 120,
    maxWidth: fullWidth ? undefined : 200,
    alignSelf: fullWidth ? undefined : 'center',
  };

  switch (variant) {
    case 'danger':
      return { ...baseStyle, backgroundColor: '#b02a2a' };
    case 'ghost':
      return { ...baseStyle, backgroundColor: '#E5DCC9' };
    case 'secondary':
      return { ...baseStyle, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5DCC9' };
    default:
      return { ...baseStyle, backgroundColor: '#0c4309' };
  }
};

export const getButtonTextStyle = (variant?: ButtonVariant, fullWidth?: boolean): TextStyle => {
  const baseStyle: TextStyle = {
    fontSize: fullWidth ? 16 : 14,
    fontWeight: '600',
    textAlign: 'center',
  };

  switch (variant) {
    case 'danger':
      return { ...baseStyle, color: '#FFFFFF' };
    case 'ghost':
      return { ...baseStyle, color: '#0c4309' };
    case 'secondary':
      return { ...baseStyle, color: '#0c4309' };
    default:
      return { ...baseStyle, color: '#FFFFFF' };
  }
};






