import type { LandingServiceItem } from '../../landing.types';

export type ServiceCardProps = {
  item: LandingServiceItem;
  onPress: (route: LandingServiceItem['route']) => void;
};
