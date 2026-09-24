/**
 * Provider available-feed scope (HLP-48).
 *
 * Zone rectangles are the Helpr service area from
 * `apps/customer-app/src/app/(services)/moving/moving.utils.ts`.
 * `shared/helpr-core/zones.ts` (HLP-40 / PR #41) is the same list and is not
 * on this branch. Do not retune coordinates here.
 *
 * Jobs store formatted addresses, not coordinates, so the open-feed query
 * matches zone names and ZIP prefixes on `location`, `start_location`, and
 * `end_location`. That predicate is the gate. The client does not download
 * the unfiltered open set and then filter it.
 */

export const OPEN_FEED_STATUS_QUERY = [
  'finding_pros',
  'select_service_provider',
  'Finding_Pros',
  'Select_Service_Provider',
] as const;

export const IN_PROGRESS_FEED_STATUS_QUERY = [
  'confirmed',
  'helpr_otw',
  'in_progress',
  'Confirmed',
  'Helpr_Otw',
  'In_Progress',
] as const;

export const SERVICE_FEED_COLUMNS = [
  'service_id',
  'customer_id',
  'service_type',
  'status',
  'scheduling_type',
  'scheduled_date_time',
  'date_of_creation',
  'start_location',
  'end_location',
  'location',
  'price',
  'start_datetime',
  'end_datetime',
  'payment_method_type',
  'autofill_type',
  'description',
  'service_provider_id',
].join(', ');

const LOCATION_COLUMNS = ['location', 'start_location', 'end_location'] as const;

const GEO_TEXT_KEYS = [
  'zones',
  'service_zones',
  'boroughs',
  'service_area',
  'service_areas',
  'zone',
  'borough',
  'home_borough',
  'service_zone',
  'city',
  'home_city',
  'address',
  'home_address',
  'location',
] as const;

const LATITUDE_KEYS = ['latitude', 'lat', 'home_latitude', 'location_latitude'] as const;
const LONGITUDE_KEYS = ['longitude', 'lng', 'lon', 'home_longitude', 'location_longitude'] as const;

const SKILL_KEYS = [
  'skills',
  'service_types',
  'services_offered',
  'offered_services',
  'specialties',
  'job_types',
  'categories',
  'service_type',
] as const;

type ZoneBox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type ServiceZone = {
  name: string;
  box: ZoneBox;
  /** Substrings matched against formatted addresses and profile geo text. */
  needles: readonly string[];
};

/**
 * Inclusive boxes. Same coordinates as the customer composers.
 * Jersey City sits in both the Hudson County and Manhattan rectangles;
 * a coordinate in that overlap maps to both zones.
 */
const SERVICE_ZONES: readonly ServiceZone[] = [
  {
    name: 'Manhattan',
    box: { minLat: 40.6808, maxLat: 40.8820, minLng: -74.0477, maxLng: -73.9070 },
    needles: ['Manhattan', 'NY 100', 'NY 101', 'NY 102'],
  },
  {
    name: 'Brooklyn',
    box: { minLat: 40.5512, maxLat: 40.7395, minLng: -74.0530, maxLng: -73.8334 },
    needles: ['Brooklyn', 'NY 112'],
  },
  {
    name: 'Queens',
    box: { minLat: 40.5380, maxLat: 40.8007, minLng: -73.9620, maxLng: -73.7004 },
    needles: ['Queens', 'NY 111', 'NY 113', 'NY 114', 'NY 116'],
  },
  {
    name: 'Bronx',
    box: { minLat: 40.7850, maxLat: 40.9176, minLng: -73.9330, maxLng: -73.7650 },
    needles: ['Bronx', 'NY 104'],
  },
  {
    name: 'Staten Island',
    box: { minLat: 40.4810, maxLat: 40.6510, minLng: -74.2557, maxLng: -74.0520 },
    needles: ['Staten Island', 'NY 103'],
  },
  {
    name: 'Westchester County',
    box: { minLat: 40.8940, maxLat: 41.3570, minLng: -74.0770, maxLng: -73.4810 },
    needles: ['Westchester', 'NY 105', 'NY 106', 'NY 107', 'NY 108'],
  },
  {
    name: 'Hudson County',
    box: { minLat: 40.6500, maxLat: 40.8770, minLng: -74.1200, maxLng: -74.0100 },
    needles: ['Hudson County', 'Jersey City', 'Hoboken', 'Union City', 'Bayonne', 'Weehawken', 'NJ 073'],
  },
  {
    name: 'Bergen County',
    box: { minLat: 40.7900, maxLat: 41.1200, minLng: -74.2050, maxLng: -73.8640 },
    needles: ['Bergen County', 'Fort Lee', 'Hackensack', 'Teaneck', 'Englewood', 'NJ 076'],
  },
];

const WHOLE_VALUE_ZONE: Record<string, string> = {
  'new york': 'Manhattan',
  nyc: 'Manhattan',
  'new york city': 'Manhattan',
};

export type OpenFeedBlockReason = 'missing-profile' | 'empty-geo' | 'empty-skills';

export type ProviderFeedScope =
  | {
      queryOpen: false;
      reason: OpenFeedBlockReason;
      notice: string;
    }
  | {
      queryOpen: true;
      geoSource: 'profile' | 'coordinates' | 'service-area-fallback';
      zoneNames: string[];
      locationOr: string;
      skillOr: string | null;
      notice: null;
    };

const NOTICES: Record<OpenFeedBlockReason, string> = {
  'missing-profile': 'We could not verify your service area, so open jobs are hidden.',
  'empty-geo': 'Add a service area to your profile to see open jobs.',
  'empty-skills': 'Add the services you offer to see open jobs.',
};

const blocked = (reason: OpenFeedBlockReason): ProviderFeedScope => ({
  queryOpen: false,
  reason,
  notice: NOTICES[reason],
});

const asStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap(item => asStringList(item));
  }
  if (typeof value !== 'string') {
    return [];
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed.startsWith('[')) {
    try {
      return asStringList(JSON.parse(trimmed) as unknown);
    } catch {
      // Not JSON; fall through to a delimiter split.
    }
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map(part => part.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  }
  return trimmed.split(/[,|/]/).map(part => part.trim()).filter(Boolean);
};

const uniqueZones = (zones: readonly ServiceZone[]): ServiceZone[] => {
  const seen = new Set<string>();
  const result: ServiceZone[] = [];
  zones.forEach(zone => {
    if (seen.has(zone.name)) {
      return;
    }
    seen.add(zone.name);
    result.push(zone);
  });
  return result;
};

const zonesMatchingText = (text: string): ServiceZone[] => {
  const haystack = text.toLowerCase();
  const exact = WHOLE_VALUE_ZONE[haystack.trim()];
  if (exact) {
    const zone = SERVICE_ZONES.find(item => item.name === exact);
    return zone ? [zone] : [];
  }
  return SERVICE_ZONES.filter(zone =>
    zone.needles.some(needle => haystack.includes(needle.toLowerCase())),
  );
};

const zonesContaining = (latitude: number, longitude: number): ServiceZone[] =>
  SERVICE_ZONES.filter(zone =>
    latitude >= zone.box.minLat
    && latitude <= zone.box.maxLat
    && longitude >= zone.box.minLng
    && longitude <= zone.box.maxLng,
  );

const firstFinite = (
  row: Record<string, unknown>,
  keys: readonly string[],
): number | null => {
  for (const key of keys) {
    if (!(key in row) || row[key] === null || row[key] === undefined || row[key] === '') {
      continue;
    }
    const numeric = typeof row[key] === 'number' ? row[key] : Number(row[key]);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
};

const quoteIlike = (needle: string): string => {
  const pattern = `*${needle}*`;
  return /[\s,.:()]/.test(pattern) ? `"${pattern}"` : pattern;
};

export const locationOrFilter = (zones: readonly ServiceZone[]): string => {
  const parts: string[] = [];
  zones.forEach(zone => {
    zone.needles.forEach(needle => {
      const pattern = quoteIlike(needle);
      LOCATION_COLUMNS.forEach(column => {
        parts.push(`${column}.ilike.${pattern}`);
      });
    });
  });
  return parts.join(',');
};

const SKILL_TOKENS: readonly { token: string; aliases: readonly string[] }[] = [
  { token: 'moving', aliases: ['moving'] },
  { token: 'cleaning', aliases: ['cleaning'] },
  { token: 'furniture', aliases: ['furniture'] },
  { token: 'home', aliases: ['home'] },
  { token: 'wall', aliases: ['wall', 'mounting'] },
  { token: 'custom', aliases: ['custom'] },
];

const tokensForSkill = (raw: string): string[] => {
  const normalized = raw.toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (!normalized) {
    return [];
  }
  const hits = SKILL_TOKENS.filter(entry =>
    entry.aliases.some(alias => normalized.includes(alias)),
  );
  if (hits.length > 0) {
    return hits.map(entry => entry.token);
  }
  const token = normalized.replace(/[^a-z0-9]+/g, '');
  return token ? [token] : [];
};

export const skillOrFilter = (tokens: readonly string[]): string =>
  tokens.map(token => `service_type.ilike.${quoteIlike(token)}`).join(',');

const resolveSkills = (
  row: Record<string, unknown>,
): { skillOr: string | null; blocked: boolean } => {
  const present = SKILL_KEYS.filter(key => key in row);
  if (present.length === 0) {
    return { skillOr: null, blocked: false };
  }
  const values = present.flatMap(key => asStringList(row[key]));
  if (values.length === 0) {
    return { skillOr: null, blocked: true };
  }
  const tokens = Array.from(new Set(values.flatMap(tokensForSkill)));
  if (tokens.length === 0) {
    return { skillOr: null, blocked: true };
  }
  return { skillOr: skillOrFilter(tokens), blocked: false };
};

const resolveZones = (
  row: Record<string, unknown>,
): { zones: ServiceZone[]; source: 'profile' | 'coordinates' | 'service-area-fallback' } | OpenFeedBlockReason => {
  const textKeys = GEO_TEXT_KEYS.filter(key => key in row);
  if (textKeys.length > 0) {
    const values = textKeys.flatMap(key => asStringList(row[key]));
    if (values.length === 0) {
      return 'empty-geo';
    }
    const zones = uniqueZones(values.flatMap(zonesMatchingText));
    if (zones.length === 0) {
      return 'empty-geo';
    }
    return { zones, source: 'profile' };
  }

  const coordinateKeysPresent = [...LATITUDE_KEYS, ...LONGITUDE_KEYS].some(key => key in row);
  if (coordinateKeysPresent) {
    const latitude = firstFinite(row, LATITUDE_KEYS);
    const longitude = firstFinite(row, LONGITUDE_KEYS);
    if (latitude === null || longitude === null) {
      return 'empty-geo';
    }
    const zones = zonesContaining(latitude, longitude);
    if (zones.length === 0) {
      return 'empty-geo';
    }
    return { zones, source: 'coordinates' };
  }

  return { zones: [...SERVICE_ZONES], source: 'service-area-fallback' };
};

/**
 * Scope for the available-jobs query.
 *
 * - Profile geo that is empty or outside the Helpr zones fails closed.
 * - A profile with no geo column (signup today writes name, email, and phone
 *   only) falls back to the eight Helpr zones, still as a server-side filter.
 * - A skills column that is present but empty fails closed. No skills column
 *   omits the skill predicate; the feed is still geo-scoped.
 * - A missing provider row fails closed. In-progress jobs are a separate query.
 */
export const resolveProviderFeedScope = (
  providerRow: Record<string, unknown> | null | undefined,
): ProviderFeedScope => {
  if (!providerRow) {
    return blocked('missing-profile');
  }

  const zones = resolveZones(providerRow);
  if (typeof zones === 'string') {
    return blocked(zones);
  }

  const skills = resolveSkills(providerRow);
  if (skills.blocked) {
    return blocked('empty-skills');
  }

  return {
    queryOpen: true,
    geoSource: zones.source,
    zoneNames: zones.zones.map(zone => zone.name),
    locationOr: locationOrFilter(zones.zones),
    skillOr: skills.skillOr,
    notice: null,
  };
};
