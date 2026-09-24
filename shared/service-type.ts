/**
 * Canonical `service.service_type` vocabulary (HLP-29).
 *
 * Form: lowercase kebab-case, one slug per customer route in
 * `apps/customer-app/src/constants/routes.ts`:
 *
 * - `moving`
 * - `cleaning`
 * - `furniture-assembly`
 * - `home-improvement`
 * - `wall-mounting`
 * - `custom-service`
 *
 * `home-improvement` is a real composer and route. `custom-service` matches
 * that route file; `custom` and `customService` are read aliases.
 *
 * Compare and route through `canonicalizeServiceType`. Do not substring-match
 * raw strings. Writes from composers use `serviceTypeSlug`.
 *
 * Wall mounting is not cleaning. `wall-mounting.tsx` used to insert
 * `service_type: 'cleaning'` because it was cloned from the cleaning form.
 * That was a bug. New writes use `wall-mounting`. Rows already stored as
 * `cleaning` cannot be distinguished from real cleaning jobs, so this module
 * does not map `cleaning` to wall mounting and does not migrate old rows.
 *
 * Legacy `running-errands` / "running errands" alias to `custom-service`
 * (the route is marked legacy in `routes.ts`, and booked-services already
 * opened the custom composer for that label).
 */

export const SERVICE_TYPES = [
  'moving',
  'cleaning',
  'furniture-assembly',
  'home-improvement',
  'wall-mounting',
  'custom-service',
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

export const serviceTypeSlug: { [Key in ServiceType]: Key } = {
  moving: 'moving',
  cleaning: 'cleaning',
  'furniture-assembly': 'furniture-assembly',
  'home-improvement': 'home-improvement',
  'wall-mounting': 'wall-mounting',
  'custom-service': 'custom-service',
};

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  moving: 'Moving',
  cleaning: 'Cleaning',
  'furniture-assembly': 'Furniture Assembly',
  'home-improvement': 'Home Improvement',
  'wall-mounting': 'Wall Mounting',
  'custom-service': 'Custom Service',
};

/** Provider feed chips. Labels stay the existing copy; ids are canonical slugs. */
export const SERVICE_TYPE_FILTER_OPTIONS = [
  { id: 'all', label: 'All types' },
  { id: serviceTypeSlug.moving, label: 'Moving' },
  { id: serviceTypeSlug.cleaning, label: 'Cleaning' },
  { id: serviceTypeSlug['furniture-assembly'], label: 'Furniture' },
  { id: serviceTypeSlug['home-improvement'], label: 'Home improvement' },
  { id: serviceTypeSlug['wall-mounting'], label: 'Wall mounting' },
  { id: serviceTypeSlug['custom-service'], label: 'Custom' },
] as const;

export type ServiceTypeFilterId = (typeof SERVICE_TYPE_FILTER_OPTIONS)[number]['id'];

const CUSTOM_SERVICE: ServiceType = 'custom-service';

/**
 * Whole-string aliases after hyphen/space/underscore/camelCase normalization.
 * Keys are the normalized form, not the raw user string.
 */
const SERVICE_TYPE_ALIASES: Record<string, ServiceType> = {
  moving: 'moving',
  cleaning: 'cleaning',
  'furniture-assembly': 'furniture-assembly',
  furnitureassembly: 'furniture-assembly',
  furniture: 'furniture-assembly',
  'home-improvement': 'home-improvement',
  homeimprovement: 'home-improvement',
  home: 'home-improvement',
  'wall-mounting': 'wall-mounting',
  wallmounting: 'wall-mounting',
  wall: 'wall-mounting',
  'custom-service': CUSTOM_SERVICE,
  customservice: CUSTOM_SERVICE,
  custom: CUSTOM_SERVICE,
  'running-errands': CUSTOM_SERVICE,
  runningerrands: CUSTOM_SERVICE,
};

const SERVICE_TYPE_SET = new Set<string>(SERVICE_TYPES);

export function isServiceType(value: string | null | undefined): value is ServiceType {
  return typeof value === 'string' && SERVICE_TYPE_SET.has(value);
}

function normalizeServiceTypeKey(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/** Map a raw `service_type` to a canonical slug, or null when it is unknown. */
export function canonicalizeServiceType(value: string | null | undefined): ServiceType | null {
  if (value == null) {
    return null;
  }

  const key = normalizeServiceTypeKey(value);
  if (!key) {
    return null;
  }

  return SERVICE_TYPE_ALIASES[key] ?? null;
}

export function serviceTypesEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const canonicalLeft = canonicalizeServiceType(left);
  const canonicalRight = canonicalizeServiceType(right);
  if (canonicalLeft && canonicalRight) {
    return canonicalLeft === canonicalRight;
  }
  return false;
}

/** Exact match after canonicalization. `all` or an empty filter matches everything. */
export function matchesServiceTypeFilter(
  serviceType: string | null | undefined,
  filterId: string | null | undefined,
): boolean {
  if (filterId == null || filterId.trim() === '' || filterId === 'all') {
    return true;
  }

  const wanted = canonicalizeServiceType(filterId);
  if (!wanted) {
    return false;
  }

  return canonicalizeServiceType(serviceType) === wanted;
}

/**
 * Customer edit route for a stored service type.
 * Unknown values keep the previous booked-services fallback: custom-service.
 */
export function serviceTypeEditPath(value: string | null | undefined): string {
  const slug = canonicalizeServiceType(value);
  return `/(services)/${slug ?? CUSTOM_SERVICE}`;
}

/** Display label. Unknown non-empty values are title-cased; empty uses `fallback`. */
export function formatServiceTypeLabel(
  value: string | null | undefined,
  fallback = 'Service',
): string {
  const slug = canonicalizeServiceType(value);
  if (slug) {
    return SERVICE_TYPE_LABELS[slug];
  }

  if (value == null) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Rewrite `service_type` to the canonical slug when the value is a known alias. */
export function withCanonicalServiceType<T extends { service_type?: string | null }>(row: T): T {
  const slug = canonicalizeServiceType(row.service_type);
  if (!slug || row.service_type === slug) {
    return row;
  }

  return { ...row, service_type: slug };
}
