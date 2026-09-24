/** Public job-photo URLs stored on `service.photo_urls`. Keep parsing aligned with customer `jobPhotos.ts`. */

export function parsePhotoUrls(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && /^https?:\/\//i.test(item));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    try {
      return parsePhotoUrls(JSON.parse(trimmed));
    } catch {
      return /^https?:\/\//i.test(trimmed) ? [trimmed] : [];
    }
  }
  return [];
}
