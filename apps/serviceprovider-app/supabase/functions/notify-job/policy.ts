export const CHAT_OPEN_STATUSES = ['confirmed', 'helpr_otw', 'in_progress', 'completed'] as const;

export type PartyRole = 'customer' | 'provider';
export type NoticeKind = 'message' | 'cancel' | 'status';
export type PushStatus = 'pending' | 'sent' | 'degraded' | 'failed';

export type AlertOutcome = {
  inApp: boolean;
  pushDelivered: boolean;
  reason: string | null;
};

const STATUS_ALERTS: Record<string, { title: string; body: string }> = {
  helpr_otw: {
    title: 'Your Helpr is on the way',
    body: 'Your Helpr is heading to the job.',
  },
  // in_progress is the arrived / start step. There is no separate arrived status.
  in_progress: {
    title: 'Your Helpr has arrived',
    body: 'Your Helpr is at the job and has started the service.',
  },
  completed: {
    title: 'Service complete',
    body: 'Your Helpr marked this service complete.',
  },
};

export function isJobChatUnlocked(
  status: string | null | undefined,
  providerId: string | null | undefined,
): boolean {
  if (!providerId) {
    return false;
  }
  const normalized = (status ?? '').toLowerCase();
  return (CHAT_OPEN_STATUSES as readonly string[]).includes(normalized);
}

export function statusAlertCopy(status: string | null | undefined): { title: string; body: string } | null {
  const normalized = (status ?? '').toLowerCase();
  return STATUS_ALERTS[normalized] ?? null;
}

export function cancelAlertCopy(): { title: string; body: string } {
  return {
    title: 'Job cancelled',
    body: 'Your Helpr cancelled this job. It is open for another pro.',
  };
}

export function messageAlertCopy(preview: string): { title: string; body: string } {
  const trimmed = preview.trim().replace(/\s+/g, ' ').slice(0, 140);
  return {
    title: 'New job message',
    body: trimmed || 'You have a new message on your job.',
  };
}

export function cancelConfirmPrompt(): string {
  return 'Are you sure you want to cancel this confirmed job? After it is cancelled, we will try to alert the customer in the app.';
}

export function describeAlertOutcome(kind: NoticeKind, outcome: AlertOutcome): string {
  if (!outcome.inApp) {
    if (kind === 'cancel') {
      return 'The job is cancelled, but the customer was not alerted.';
    }
    if (kind === 'status') {
      return 'The status was saved, but the customer was not alerted.';
    }
    return 'The message could not be delivered as an alert.';
  }

  if (outcome.pushDelivered) {
    if (kind === 'cancel') {
      return 'The job is cancelled and the customer was notified.';
    }
    if (kind === 'status') {
      return 'The customer was notified.';
    }
    return 'Message sent. The other person was notified.';
  }

  const reason = outcome.reason ? ` (${outcome.reason})` : '';
  if (kind === 'cancel') {
    return `The job is cancelled. The customer has an in-app alert. Push was not delivered${reason}.`;
  }
  if (kind === 'status') {
    return `The customer has an in-app alert. Push was not delivered${reason}.`;
  }
  return `Message sent. The other person has an in-app alert. Push was not delivered${reason}.`;
}

export function isExpoPushToken(value: string | null | undefined): boolean {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(value ?? '');
}

export function decidePushAttempt(input: {
  expoAccessToken: string | null | undefined;
  tokens: Array<string | null | undefined>;
}): {
  attempt: boolean;
  pushStatus: 'degraded' | 'pending';
  reason: string | null;
  deliverableTokens: string[];
} {
  const deliverableTokens = input.tokens.filter((token): token is string => isExpoPushToken(token));
  const accessToken = (input.expoAccessToken ?? '').trim();
  if (!accessToken) {
    return {
      attempt: false,
      pushStatus: 'degraded',
      reason: 'expo_access_token_missing',
      deliverableTokens: [],
    };
  }
  if (deliverableTokens.length === 0) {
    return {
      attempt: false,
      pushStatus: 'degraded',
      reason: 'no_push_token',
      deliverableTokens: [],
    };
  }
  return {
    attempt: true,
    pushStatus: 'pending',
    reason: null,
    deliverableTokens,
  };
}

export type ExpoTicket = { status?: string; message?: string };

export function expoTicketList(payload: unknown): ExpoTicket[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const data = (payload as { data?: unknown }).data;
  if (Array.isArray(data)) {
    return data.filter((item): item is ExpoTicket => Boolean(item) && typeof item === 'object');
  }
  if (data && typeof data === 'object') {
    return [data as ExpoTicket];
  }
  return [];
}

export function interpretExpoTickets(tickets: ExpoTicket[]): {
  pushDelivered: boolean;
  pushStatus: 'sent' | 'failed';
  reason: string | null;
} {
  if (tickets.some(ticket => ticket.status === 'ok')) {
    return { pushDelivered: true, pushStatus: 'sent', reason: null };
  }
  const message = tickets.find(ticket => ticket.message)?.message ?? 'expo_ticket_error';
  return { pushDelivered: false, pushStatus: 'failed', reason: message };
}
