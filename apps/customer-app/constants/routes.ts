// Centralized route param types for the customer app.
// Import this where pages or navigation helpers need route names/params.
export type RouteParams = {
  landing: undefined;
  moving: undefined;
  cleaning: undefined;
  'furniture-assembly': undefined;
  'home-improvement': undefined;
  'running-errands': undefined;
  'wall-mounting': undefined;
  'booked-services': undefined;
  'past-services': undefined;
  account: undefined;
  'contact-support': undefined;
  'user-guide': undefined;
  'customer-service-chat': undefined;
  signup: undefined;
  selecthelpr: { serviceId: string };
};

// Optional: a helper constant if you only need route names elsewhere
export const ROUTES = [
  'landing',
  'moving',
  'cleaning',
  'furniture-assembly',
  'home-improvement',
  'running-errands',
  'wall-mounting',
  'booked-services',
  'past-services',
  'account',
  'contact-support',
  'user-guide',
  'customer-service-chat',
  'signup',
  'selecthelpr',
] as const;

export type RouteName = typeof ROUTES[number];
