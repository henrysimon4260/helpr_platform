// Centralized route param types for the customer app.
// Import this where pages or navigation helpers need route names/params.
export type RouteParams = {
  // Service routes (in (services) group)
  moving: undefined;
  cleaning: undefined;
  'furniture-assembly': undefined;
  'home-improvement': undefined;
  'wall-mounting': undefined;
  'custom-service': undefined;
  // Booking flow routes (in (booking-flow) group)
  'booked-services': undefined;
  'past-services': undefined;
  'select-helpr': { serviceId: string };
  'service-details': { serviceId: string };
  // Home routes (in (home) group)
  landing: undefined;
  account: undefined;
  'customer-service-chat': undefined;
  // Auth routes (in (auth) group)
  signup: undefined;
  login: undefined;
  // Legacy routes (kept for backwards compatibility)
  'running-errands': undefined;
  'contact-support': undefined;
  'user-guide': undefined;
};

// Optional: a helper constant if you only need route names elsewhere
export const ROUTES = [
  'moving',
  'cleaning',
  'furniture-assembly',
  'home-improvement',
  'wall-mounting',
  'custom-service',
  'booked-services',
  'past-services',
  'select-helpr',
  'service-details',
  'landing',
  'account',
  'customer-service-chat',
  'signup',
  'login',
] as const;

export type RouteName = (typeof ROUTES)[number];

// Route group prefixes for cleaner navigation
export const SERVICES_PREFIX = '/(services)';
export const BOOKING_FLOW_PREFIX = '/(booking-flow)';
export const HOME_PREFIX = '/(home)';
export const AUTH_PREFIX = '/(auth)';
