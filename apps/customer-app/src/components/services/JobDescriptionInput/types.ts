import { ReactNode } from 'react';
import { NativeSyntheticEvent, TextInputSelectionChangeEventData, TextInputSubmitEditingEventData } from 'react-native';

export interface JobDescriptionInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmitEditing?: (e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => void;
  onContainerPress?: () => void;
  placeholder?: string;
  editable?: boolean;
  selection?: { start: number; end: number };
  onSelectionChange?: (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => void;
  children?: ReactNode;
}






