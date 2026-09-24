export const CHECKR_STATUSES = [
  'not_started',
  'pending',
  'clear',
  'consider',
  'suspended',
  'expired',
  'canceled',
] as const;

export type CheckrGateStatus = (typeof CHECKR_STATUSES)[number];

export const CHECKR_STUCK_AFTER_MS = 8 * 24 * 60 * 60 * 1000;

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI',
  'WY',
]);

export type CheckrCallToAction = 'start' | 'continue' | 'restart' | 'none';

export type CheckrGoLiveCopy = {
  title: string;
  message: string;
  action: CheckrCallToAction;
  actionLabel: string | null;
};

export function normalizeCheckrStatus(value: unknown): CheckrGateStatus {
  if (typeof value !== 'string') {
    return 'not_started';
  }
  const normalized = value.trim().toLowerCase();
  if ((CHECKR_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as CheckrGateStatus;
  }
  return 'not_started';
}

export function isCheckrClear(status: unknown): boolean {
  return normalizeCheckrStatus(status) === 'clear';
}

export function isUsStateCode(value: string): boolean {
  return US_STATE_CODES.has(value.trim().toUpperCase());
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function checkrGoLiveCopy(input: {
  status: unknown;
  invitationExpiresAt?: string | null;
  statusUpdatedAt?: string | null;
  hasInvitationUrl?: boolean;
  loadError?: boolean;
  now?: number;
}): CheckrGoLiveCopy {
  if (input.loadError) {
    return {
      title: 'Background check unavailable',
      message: 'We could not confirm your Checkr status, so open jobs stay locked. Try again in a moment. You cannot accept paid work until Checkr reports clear.',
      action: 'none',
      actionLabel: null,
    };
  }

  const status = normalizeCheckrStatus(input.status);
  const now = input.now ?? Date.now();
  const expiresAt = parseTime(input.invitationExpiresAt);
  const updatedAt = parseTime(input.statusUpdatedAt);
  const invitationExpired = expiresAt !== null && expiresAt <= now;
  const stuck = updatedAt !== null && now - updatedAt >= CHECKR_STUCK_AFTER_MS;

  if (status === 'clear') {
    return {
      title: 'Background check clear',
      message: 'Checkr cleared you. You can view open jobs and accept paid work.',
      action: 'none',
      actionLabel: null,
    };
  }

  if (status === 'consider') {
    return {
      title: 'Background check needs review',
      message: 'Checkr returned a consider result. Helpr does not allow consider results to accept jobs. Contact Helpr support. You will not go live from this screen.',
      action: 'none',
      actionLabel: null,
    };
  }

  if (status === 'suspended') {
    return {
      title: 'Background check suspended',
      message: 'Checkr suspended this report. You cannot see open jobs or accept work until it is resolved. Contact Helpr support.',
      action: 'none',
      actionLabel: null,
    };
  }

  if (status === 'expired' || (status === 'pending' && invitationExpired)) {
    return {
      title: 'Background check expired',
      message: 'Your Checkr invitation expired before the check finished. Open jobs stay locked. Start a new Checkr invitation to go live.',
      action: 'restart',
      actionLabel: 'Start a new Checkr check',
    };
  }

  if (status === 'pending' && stuck) {
    return {
      title: 'Background check stuck',
      message: 'This Checkr check has not finished. You cannot accept jobs until a report comes back clear. Start a new invitation, or contact support if you already completed it.',
      action: 'restart',
      actionLabel: 'Start a new Checkr check',
    };
  }

  if (status === 'canceled') {
    return {
      title: 'Background check canceled',
      message: 'This Checkr check was canceled. You cannot accept paid work until a new check comes back clear.',
      action: 'restart',
      actionLabel: 'Start a new Checkr check',
    };
  }

  if (status === 'pending') {
    return {
      title: 'Background check in progress',
      message: 'Finish your Checkr invitation. You can accept jobs only after Checkr reports clear. A consider, failed, or expired check keeps you off open jobs.',
      action: input.hasInvitationUrl ? 'continue' : 'start',
      actionLabel: input.hasInvitationUrl ? 'Continue Checkr invitation' : 'Start Checkr check',
    };
  }

  return {
    title: 'Background check required',
    message: 'A Checkr background check has to come back clear before you can see open jobs or accept paid work. Stripe payout setup does not replace this check.',
    action: 'start',
    actionLabel: 'Start Checkr check',
  };
}
