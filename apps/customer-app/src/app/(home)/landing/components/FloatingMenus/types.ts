import type React from 'react';
import type { NavigateFn } from '../../landing.types';

export type FloatingMenusProps = {
  canRenderLottie: boolean;
  lottieRef: React.RefObject<any>;
  helpLottieRef: React.RefObject<any>;
  isMenuOpen: boolean;
  isHelpMenuOpen: boolean;
  onMenuPress: () => void;
  onHelpPress: () => void;
  onCloseMenu: () => void;
  onCloseHelpMenu: () => void;
  onNavigate: NavigateFn;
  onAccountPress: () => void;
};
