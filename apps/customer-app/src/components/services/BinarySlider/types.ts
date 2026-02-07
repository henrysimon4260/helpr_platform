import { ImageSourcePropType, ImageStyle } from 'react-native';

export interface BinarySliderProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  leftIcon: ImageSourcePropType;
  rightIcon: ImageSourcePropType;
  title: string;
  subtitle: string;
  leftIconStyle?: ImageStyle;
  rightIconStyle?: ImageStyle;
}






