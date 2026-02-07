export interface PasswordInputProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  error?: string;
  showStrength?: boolean;
  minLength?: number;
}

export interface PasswordStrength {
  label: string;
  color: string;
}
