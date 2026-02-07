export interface EmailInputProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  error?: string;
  autoFocus?: boolean;
  editable?: boolean;
}
