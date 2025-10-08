// Centralized route param types for the service provider app.
export type RouteParams = {
  landing: undefined;
  account: undefined;
  login: undefined;
  signup: undefined;
  'customer-service-chat': undefined;
};

export const ROUTES = [
  'landing',
  'account',
  'login',
  'signup',
  'customer-service-chat',
] as const;

export type RouteName = typeof ROUTES[number];
