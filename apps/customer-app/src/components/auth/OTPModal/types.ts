export interface OTPModalProps {
  visible: boolean;
  email: string;
  otpCode: string;
  onChangeOTP: (code: string) => void;
  onVerify: () => void;
  onResend: () => void;
  onClose: () => void;
  loading?: boolean;
  title?: string;
  subtitle?: string;
}
