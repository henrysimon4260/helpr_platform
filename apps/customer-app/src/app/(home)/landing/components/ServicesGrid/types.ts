import type { LandingServiceItem } from '../../landing.types';

export type ServicesGridProps = {
  services: LandingServiceItem[];
  onPressService: (route: LandingServiceItem['route']) => void;
};
