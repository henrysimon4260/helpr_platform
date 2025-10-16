import React from 'react';
import {
  Modal,
  ModalProps,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';

type StyledModalButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type StyledModalButton = {
  text: string;
  onPress: () => void;
  variant?: StyledModalButtonVariant;
  disabled?: boolean;
  testID?: string;
  fullWidth?: boolean;
};

export type StyledModalProps = {
  visible: boolean;
  title: string;
  message?: string;
  buttons: StyledModalButton[];
  children?: React.ReactNode;
  onRequestClose?: () => void;
  allowBackdropDismiss?: boolean;
  modalStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  animationType?: ModalProps['animationType'];
  testID?: string;
};

const StyledModal: React.FC<StyledModalProps> = ({
  visible,
  title,
  message,
  buttons,
  children,
  onRequestClose,
  allowBackdropDismiss = true,
  modalStyle,
  contentStyle,
  animationType = 'fade',
  testID,
}) => {
  const handleBackdropPress = () => {
    if (allowBackdropDismiss && onRequestClose) {
      onRequestClose();
    }
  };

  const resolvedButtons = buttons.length
    ? buttons
    : [
        {
          text: 'OK',
          onPress: () => {
            onRequestClose?.();
          },
          variant: 'primary' as const,
        },
      ];

  const buttonLayout: 'row' | 'column' = resolvedButtons.length <= 2 ? 'row' : 'column';
  const hasBodyContent = Boolean(children) || Boolean(message);

  const bodyContent = children ? (
    <View style={[styles.contentContainer, contentStyle]}>{children}</View>
  ) : message ? (
    <Text style={styles.message}>{message}</Text>
  ) : null;

  const buttonsContainerStyles: StyleProp<ViewStyle>[] = [
    styles.buttonsContainer,
    buttonLayout === 'row' ? styles.buttonsRow : styles.buttonsColumn,
  ];

  if (!hasBodyContent) {
    buttonsContainerStyles.push(styles.buttonsContainerTight);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={onRequestClose}
    >
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.modal, modalStyle]} testID={testID}>
              <Text style={styles.title}>{title}</Text>
              <View style={styles.divider} />
              {bodyContent}
              <View style={buttonsContainerStyles}>
                {resolvedButtons.map((button, index) => {
                  const {
                    variant = 'primary',
                    text,
                    onPress,
                    disabled,
                    testID: buttonTestID,
                    fullWidth,
                  } = button;

                  const buttonStyles = [
                    styles.buttonBase,
                    buttonLayout === 'row' && !fullWidth && styles.buttonRowItem,
                    (buttonLayout === 'column' || fullWidth) && styles.buttonFullWidth,
                    buttonLayout === 'row' && index > 0 && styles.buttonRowSpacing,
                    buttonLayout === 'column' && index > 0 && styles.buttonColumnSpacing,
                    variant !== 'ghost' && styles.buttonShadow,
                    getButtonBackgroundStyle(variant),
                    disabled && styles.buttonDisabled,
                  ];

                  return (
                    <Pressable
                      key={`${text}-${index}`}
                      style={buttonStyles}
                      onPress={() => {
                        if (!disabled) {
                          onPress();
                        }
                      }}
                      disabled={disabled}
                      android_ripple={{ color: 'rgba(12, 67, 9, 0.12)', borderless: false }}
                      testID={buttonTestID}
                    >
                      <Text style={[styles.buttonText, getButtonTextStyle(variant)]}>{text}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const getButtonBackgroundStyle = (variant: StyledModalButtonVariant) => {
  switch (variant) {
    case 'primary':
      return styles.buttonPrimary;
    case 'secondary':
      return styles.buttonSecondary;
    case 'danger':
      return styles.buttonDanger;
    case 'ghost':
    default:
      return styles.buttonGhost;
  }
};

const getButtonTextStyle = (variant: StyledModalButtonVariant) => {
  switch (variant) {
    case 'primary':
      return styles.buttonTextPrimary;
    case 'secondary':
      return styles.buttonTextSecondary;
    case 'danger':
      return styles.buttonTextPrimary;
    case 'ghost':
    default:
      return styles.buttonTextGhost;
  }
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: '#FFF8E8',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0c4309',
    textAlign: 'center',
    marginBottom: 12,
  },
  divider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: '#E3D9C8',
    marginBottom: 16,
  },
  contentContainer: {
    width: '100%',
    marginBottom: 16,
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0c4309',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  buttonsContainer: {
    alignItems: 'center',
    width: '100%',
    marginTop: 0,
  },
  buttonsContainerTight: {
    marginTop: 8,
  },
  buttonsRow: {
    flexDirection: 'row',
  },
  buttonsColumn: {
    flexDirection: 'column',
  },
  buttonBase: {
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonRowItem: {
    flex: 1,
    alignItems: 'center',
  },
  buttonFullWidth: {
    alignSelf: 'center',
    width: '100%',
    borderRadius: 30,
  },
  buttonRowSpacing: {
    marginLeft: 12,
  },
  buttonColumnSpacing: {
    marginTop: 12,
  },
  buttonPrimary: {
    backgroundColor: '#0c4309',
  },
  buttonSecondary: {
    backgroundColor: '#E5DCC9',
    borderWidth: 2,
    borderColor: '#0c4309',
  },
  buttonDanger: {
    backgroundColor: '#B3261E',
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(12, 67, 9, 0.2)',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonTextPrimary: {
    color: '#FFFFFF',
  },
  buttonTextSecondary: {
    color: '#0c4309',
  },
  buttonTextGhost: {
    color: '#0c4309',
  },
});

export default StyledModal;
