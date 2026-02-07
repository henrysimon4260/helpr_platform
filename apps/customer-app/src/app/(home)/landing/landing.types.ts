import type { ImageSourcePropType } from 'react-native';
import type { RouteParams } from '../../../constants/routes';

export type LandingRouteKey = keyof RouteParams;

export type LandingServiceItem = {
  id: string;
  title: string;
  image: ImageSourcePropType;
  route: LandingRouteKey;
};

export type MenuRouteGroup = 'services' | 'booking-flow' | 'home' | 'auth';

export type NavigateFn = (route: LandingRouteKey) => void;



















