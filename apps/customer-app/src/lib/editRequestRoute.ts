/**
 * Edit Request screen for a stored `service.service_type`.
 *
 * Composers persist these values (see serviceComposer.configs.ts and moving.hooks.ts):
 * `cleaning`, `furniture-assembly`, `home-improvement`, `wall-mounting`,
 * `customService`, `Moving`.
 *
 * Older rows use spaced names (`furniture assembly`, `home improvement`,
 * `wall mounting`, `running errands`, `custom`). Lookup compares a single
 * normalized key: trim, lowercase, then drop spaces, hyphens, and underscores.
 * Unrecognized values still open custom-service, matching the previous fallback.
 */

const CUSTOM_SERVICE_ROUTE = '/(services)/custom-service';

const ROUTE_BY_NORMALIZED_SERVICE_TYPE: Record<string, string> = {
  moving: '/(services)/moving',
  cleaning: '/(services)/cleaning',
  furnitureassembly: '/(services)/furniture-assembly',
  homeimprovement: '/(services)/home-improvement',
  wallmounting: '/(services)/wall-mounting',
  custom: CUSTOM_SERVICE_ROUTE,
  customservice: CUSTOM_SERVICE_ROUTE,
  runningerrands: CUSTOM_SERVICE_ROUTE,
};

export function normalizeServiceTypeKey(serviceType: string | null | undefined): string {
  return (serviceType ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function resolveEditRequestRoute(serviceType: string | null | undefined): string {
  const key = normalizeServiceTypeKey(serviceType);
  return ROUTE_BY_NORMALIZED_SERVICE_TYPE[key] ?? CUSTOM_SERVICE_ROUTE;
}
