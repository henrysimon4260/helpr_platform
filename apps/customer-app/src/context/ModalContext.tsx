import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import StyledModal, { StyledModalButton } from '../shared/components/StyledModal';

export type ModalButtonStyle = 'default' | 'cancel' | 'destructive';

export type ModalButtonConfig = {
  text: string;
  onPress?: () => void;
  style?: ModalButtonStyle;
  disabled?: boolean;
  fullWidth?: boolean;
};

export type ModalConfig = {
  title: string;
  message?: string;
  buttons?: ModalButtonConfig[];
  allowBackdropDismiss?: boolean;
  content?: React.ReactNode;
  animationType?: 'none' | 'slide' | 'fade';
  onDismiss?: () => void;
};

export type ModalContextValue = {
  showModal: (config: ModalConfig) => void;
  hideModal: () => void;
};

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

const mapButtonToStyled = (
  button: ModalButtonConfig,
  index: number,
  hideModal: () => void,
): StyledModalButton => {
  const { style, onPress, text, disabled, fullWidth } = button;

  let variant: StyledModalButton['variant'];
  switch (style) {
    case 'cancel':
      variant = 'ghost';
      break;
    case 'destructive':
      variant = 'danger';
      break;
    default:
      variant = index === 0 ? 'primary' : 'secondary';
      break;
  }

  return {
    text,
    variant,
    disabled,
    fullWidth,
    onPress: () => {
      hideModal();
      onPress?.();
    },
  };
};

export const ModalProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [config, setConfig] = useState<ModalConfig | null>(null);

  const hideModal = useCallback(() => {
    setConfig(null);
  }, []);

  const showModal = useCallback((modalConfig: ModalConfig) => {
    setConfig(modalConfig);
  }, []);

  const contextValue = useMemo(
    () => ({
      showModal,
      hideModal,
    }),
    [showModal, hideModal],
  );

  const styledButtons: StyledModalButton[] = useMemo(() => {
    if (!config?.buttons || config.buttons.length === 0) {
      return [
        {
          text: 'OK',
          variant: 'primary',
          onPress: hideModal,
          fullWidth: true,
        },
      ];
    }

    return config.buttons.map((button, index) => mapButtonToStyled(button, index, hideModal));
  }, [config?.buttons, hideModal]);

  const allowBackdropDismiss = config?.allowBackdropDismiss ?? true;

  const handleRequestClose = useCallback(() => {
    if (!allowBackdropDismiss) {
      return;
    }

    config?.onDismiss?.();
    hideModal();
  }, [allowBackdropDismiss, config, hideModal]);

  return (
    <ModalContext.Provider value={contextValue}>
      {children}
      <StyledModal
        visible={Boolean(config)}
        title={config?.title ?? ''}
        message={config?.content ? undefined : config?.message}
        buttons={config ? styledButtons : []}
        onRequestClose={handleRequestClose}
        allowBackdropDismiss={allowBackdropDismiss}
        animationType={config?.animationType ?? 'fade'}
      >
        {config?.content}
      </StyledModal>
    </ModalContext.Provider>
  );
};

export const useModal = (): ModalContextValue => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
