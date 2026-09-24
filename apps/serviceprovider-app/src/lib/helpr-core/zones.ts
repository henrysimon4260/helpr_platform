// Canonical: shared/helpr-core/zones.ts
// Edit there, then run: node scripts/sync-helpr-core.mjs
// Copies must stay byte-identical. Plan: docs/shared-status-fee-zone.md

/**
 * Service-area bounding boxes copied historically in moving.utils and the
 * five service composers. Boxes are inclusive on every edge.
 *
 * HLP-40 owns retuning these boxes (water and over-included counties) and
 * deleting the composer copies. Do not change coordinates in a drive-by.
 */

export type ServiceZoneBoundingBox = {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export type ZoneCoordinate = {
  latitude: number;
  longitude: number;
};

export const ALLOWED_SERVICE_ZONES: readonly ServiceZoneBoundingBox[] = [
  { name: 'Manhattan', minLat: 40.6808, maxLat: 40.8820, minLng: -74.0477, maxLng: -73.9070 },
  { name: 'Brooklyn', minLat: 40.5512, maxLat: 40.7395, minLng: -74.0530, maxLng: -73.8334 },
  { name: 'Queens', minLat: 40.5380, maxLat: 40.8007, minLng: -73.9620, maxLng: -73.7004 },
  { name: 'Bronx', minLat: 40.7850, maxLat: 40.9176, minLng: -73.9330, maxLng: -73.7650 },
  { name: 'Staten Island', minLat: 40.4810, maxLat: 40.6510, minLng: -74.2557, maxLng: -74.0520 },
  { name: 'Westchester County', minLat: 40.8940, maxLat: 41.3570, minLng: -74.0770, maxLng: -73.4810 },
  { name: 'Hudson County', minLat: 40.6500, maxLat: 40.8770, minLng: -74.1200, maxLng: -74.0100 },
  { name: 'Bergen County', minLat: 40.7900, maxLat: 41.1200, minLng: -74.2050, maxLng: -73.8640 },
];

export function isWithinServiceZone(
  coordinate: ZoneCoordinate,
  zone: ServiceZoneBoundingBox,
): boolean {
  const { latitude, longitude } = coordinate;
  return latitude >= zone.minLat && latitude <= zone.maxLat && longitude >= zone.minLng && longitude <= zone.maxLng;
}

export function isWithinServiceArea(
  coordinate: ZoneCoordinate | undefined | null,
): boolean {
  if (!coordinate) return false;
  return ALLOWED_SERVICE_ZONES.some((zone) => isWithinServiceZone(coordinate, zone));
}
