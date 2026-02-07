export interface SignInModalProps {
  visible: boolean;
  onClose: () => void;
  onSignIn?: () => void;
  onSignUp?: () => void;
  title?: string;
  message?: string;
}






