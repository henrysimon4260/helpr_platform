// Canonical: shared/helpr-core/status.ts
// Edit there, then run: node scripts/sync-helpr-core.mjs
// Copies must stay byte-identical. Plan: docs/shared-status-fee-zone.md

/**
 * Job status spellings from JOB_CONTRACT.md.
 * Do not add a status here until that contract lists it. `cancelled` is not
 * in this list. Do not accept aliases (`on_the_way`, `Helpr_Otw`).
 */

export const SERVICE_STATUSES = [
  'finding_pros',
  'pending',
  'scheduled',
  'select_service_provider',
  'confirmed',
  'helpr_otw',
  'in_progress',
  'completed',
] as const;

export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

/** Legacy rows the provider feed still reads. Do not write these for new work. */
export const LEGACY_READ_STATUSES: readonly ServiceStatus[] = ['pending', 'scheduled'];

/** Open-job feed. Matches provider landing `OPEN_FEED_STATUSES`. */
export const OPEN_FEED_STATUSES: readonly ServiceStatus[] = [
  'finding_pros',
  'pending',
  'scheduled',
  'select_service_provider',
];

/** Assigned work still on the provider "in progress" menu. */
export const IN_PROGRESS_FEED_STATUSES: readonly ServiceStatus[] = [
  'confirmed',
  'helpr_otw',
  'in_progress',
];

/**
 * Lowercase statuses landing keeps on screen (open feed plus in-progress).
 * `completed` is not in this list.
 */
export const VISIBLE_FEED_STATUSES: readonly ServiceStatus[] = [
  'finding_pros',
  'pending',
  'scheduled',
  'select_service_provider',
  'confirmed',
  'helpr_otw',
  'in_progress',
];

/**
 * Lottie frames shared by customer and provider service details.
 * Unknown statuses, including anything before `confirmed`, stay on frame 0.
 */
export const STATUS_ANIMATION_FRAMES = {
  confirmed: 0,
  helpr_otw: 20,
  in_progress: 50,
  completed: 70,
} as const;

export function isServiceStatus(value: string | null | undefined): value is ServiceStatus {
  return (SERVICE_STATUSES as readonly string[]).includes(value ?? '');
}

export function animationFrameForStatus(status: string | null | undefined): number {
  const normalized = (status ?? '').toLowerCase();
  switch (normalized) {
    case 'confirmed':
      return STATUS_ANIMATION_FRAMES.confirmed;
    case 'helpr_otw':
      return STATUS_ANIMATION_FRAMES.helpr_otw;
    case 'in_progress':
      return STATUS_ANIMATION_FRAMES.in_progress;
    case 'completed':
      return STATUS_ANIMATION_FRAMES.completed;
    default:
      return 0;
  }
}

/**
 * Next provider checkpoint button target.
 * `completed` is the signal to call `complete-service`. The edge function
 * writes that status. This helper does not write it.
 */
export function nextProviderCheckpointStatus(
  status: string | null | undefined,
): 'helpr_otw' | 'in_progress' | 'completed' | null {
  const normalized = (status ?? '').toLowerCase();
  switch (normalized) {
    case 'confirmed':
      return 'helpr_otw';
    case 'helpr_otw':
      return 'in_progress';
    case 'in_progress':
      return 'completed';
    default:
      return null;
  }
}
