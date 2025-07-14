// Centralized route param types for the service provider app.
export type RouteParams = {
  landing: undefined;
  account: undefined;
  login: undefined;
  signup: undefined;
  'customer-service-chat': undefined;
  'past-services': undefined;
};

export const ROUTES = [
  'landing',
  'account',
  'login',
  'signup',
  'customer-service-chat',
  'past-services',
] as const;

export type RouteName = typeof ROUTES[number];
