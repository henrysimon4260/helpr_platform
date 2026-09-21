import type { EditServicePayload } from './moving.types';

export type MovingEditSearchParams = {
  editServiceId?: string | string[];
  editService?: string | string[];
};

export function firstSearchParam(value: string | string[] | undefined | null): string | null {
  if (!value) {
    return null;
  }

  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export function parseEditServicePayload(raw: string | null): EditServicePayload | null {
  if (!raw) {
    return null;
  }

  const candidates = [raw];
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) {
      candidates.push(decoded);
    }
  } catch {
    // Param is already decoded, or the escape sequence is invalid.
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as EditServicePayload;
      const serviceId = typeof parsed?.service_id === 'string' ? parsed.service_id.trim() : '';
      if (parsed && typeof parsed === 'object' && serviceId) {
        return { ...parsed, service_id: serviceId };
      }
    } catch {
      // Try the next encoding.
    }
  }

  return null;
}

/**
 * New jobs mint a service id. Edits and reschedules must keep the id that
 * booked-services passed in, otherwise the schedule overlay inserts a second row.
 */
export function resolveServiceIdForSubmit(
  editServiceId: string | null,
  createId: () => string,
): { serviceId: string; isEditing: boolean } {
  if (editServiceId) {
    return { serviceId: editServiceId, isEditing: true };
  }

  return { serviceId: createId(), isEditing: false };
}
