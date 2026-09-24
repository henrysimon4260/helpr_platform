export const CHECKR_GATE_STATUSES = [
  'not_started',
  'pending',
  'clear',
  'consider',
  'suspended',
  'expired',
  'canceled',
] as const;

export type CheckrGateStatus = (typeof CHECKR_GATE_STATUSES)[number];

export type CheckrEventObject = {
  id?: string | null;
  object?: string | null;
  status?: string | null;
  result?: string | null;
  assessment?: string | null;
  candidate_id?: string | null;
  report_id?: string | null;
  custom_id?: string | null;
  invitation_url?: string | null;
  expires_at?: string | null;
};

export type CheckrStatusUpdate = {
  status: CheckrGateStatus;
  candidateId: string | null;
  reportId: string | null;
  invitationId: string | null;
  invitationUrl: string | null;
  invitationExpiresAt: string | null;
  eventType: string;
  changed: boolean;
};

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function normalizeCheckrStatus(value: unknown): CheckrGateStatus {
  const normalized = text(value).toLowerCase();
  if ((CHECKR_GATE_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as CheckrGateStatus;
  }
  return 'not_started';
}

function hexFromBuffer(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return hexFromBuffer(signature);
}

function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export function signatureCandidates(header: string): string[] {
  const found = new Set<string>();
  const trimmed = header.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    found.add(trimmed.toLowerCase());
  }
  for (const part of trimmed.split(',')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      const loose = part.trim().toLowerCase();
      if (/^[0-9a-f]{64}$/.test(loose)) {
        found.add(loose);
      }
      continue;
    }
    const key = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim().toLowerCase();
    if ((key === 'v1' || key === 'sha256') && /^[0-9a-f]{64}$/.test(value)) {
      found.add(value);
    }
  }
  const embedded = trimmed.toLowerCase().match(/[0-9a-f]{64}/g) ?? [];
  embedded.forEach(value => found.add(value));
  return [...found];
}

export async function checkrSignatureMatches(secret: string, rawBody: string, header: string | null): Promise<boolean> {
  if (!secret || !header) {
    return false;
  }
  if (header.includes('Please create an API key')) {
    return false;
  }
  const expected = await hmacSha256Hex(secret, rawBody);
  return signatureCandidates(header).some(candidate => timingSafeEqualHex(candidate, expected));
}

function nullable(value: unknown): string | null {
  const cleaned = text(value);
  return cleaned.length > 0 ? cleaned : null;
}

function statusFromReport(object: CheckrEventObject): CheckrGateStatus | null {
  const status = text(object.status).toLowerCase();
  const result = text(object.result).toLowerCase();
  const assessment = text(object.assessment).toLowerCase();
  const adverseAssessment = assessment === 'review' || assessment === 'escalated';

  if (status === 'suspended') {
    return 'suspended';
  }
  if (status === 'dispute' || status === 'disputed') {
    return 'consider';
  }
  if (status === 'canceled' || status === 'cancelled') {
    return 'canceled';
  }
  if (status === 'pending') {
    return 'pending';
  }
  if (
    status === 'complete'
    || status === 'completed'
    || result === 'clear'
    || result === 'consider'
  ) {
    if (result === 'clear' && !adverseAssessment) {
      return 'clear';
    }
    return 'consider';
  }
  return null;
}

function proposedStatus(eventType: string, object: CheckrEventObject, current: CheckrGateStatus): CheckrGateStatus | null {
  switch (eventType) {
    case 'invitation.created':
    case 'invitation.completed':
    case 'report.created':
    case 'report.resumed':
      return 'pending';
    case 'invitation.expired':
      return 'expired';
    case 'invitation.deleted':
      return 'canceled';
    case 'report.suspended':
      return 'suspended';
    case 'report.canceled':
    case 'report.cancelled':
      return 'canceled';
    case 'report.disputed':
    case 'report.pre_adverse_action':
    case 'report.post_adverse_action':
      return 'consider';
    case 'report.engaged':
      return current;
    case 'report.completed':
    case 'report.updated':
      return statusFromReport(object);
    default:
      return null;
  }
}

function resolveNext(current: CheckrGateStatus, proposed: CheckrGateStatus, eventType: string): CheckrGateStatus {
  if (eventType === 'report.engaged') {
    return current;
  }
  if (current === 'clear') {
    if (proposed === 'consider' || proposed === 'suspended') {
      return proposed;
    }
    return 'clear';
  }
  if (current === 'consider') {
    if (proposed === 'clear' || proposed === 'suspended') {
      return proposed;
    }
    return 'consider';
  }
  if (current === 'suspended') {
    if (proposed === 'pending' && eventType === 'report.resumed') {
      return 'pending';
    }
    if (proposed === 'clear' || proposed === 'consider') {
      return proposed;
    }
    return 'suspended';
  }
  return proposed;
}

export function reduceCheckrEvent(
  currentStatus: unknown,
  eventType: string,
  object: CheckrEventObject,
): CheckrStatusUpdate {
  const current = normalizeCheckrStatus(currentStatus);
  const type = text(eventType).toLowerCase();
  const objectKind = text(object.object).toLowerCase();
  const isInvitation = objectKind === 'invitation' || type.startsWith('invitation.');
  const proposed = proposedStatus(type, object, current);
  const status = proposed === null ? current : resolveNext(current, proposed, type);

  return {
    status,
    candidateId: nullable(object.candidate_id),
    reportId: isInvitation ? nullable(object.report_id) : nullable(object.id) ?? nullable(object.report_id),
    invitationId: isInvitation ? nullable(object.id) : null,
    invitationUrl: nullable(object.invitation_url),
    invitationExpiresAt: nullable(object.expires_at),
    eventType: type,
    changed: status !== current,
  };
}
