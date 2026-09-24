export const GUEST_FORM_DRAFT_KEY = 'helpr.guestFormDraft.v1';

/** Show the saved composer again, but do not auto-submit, inside this window. */
export const GUEST_FORM_RESTORE_WINDOW_MS = 12 * 60 * 60 * 1000;

/** Continue Schedule only when sign-in happens shortly after the guest saved. */
export const GUEST_FORM_RESUME_WINDOW_MS = 30 * 60 * 1000;

export const LOGGED_IN_HOME = '/(home)/landing';
export const SIGN_IN_ROUTE = '/(auth)/login';

export type GuestFormDraft<T = any> = {
  path: string;
  data?: T;
};

export type DraftStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export type PostAuthNavigation =
  | { kind: 'fallback' }
  | { kind: 'path'; path: string }
  | { kind: 'params'; pathname: string; params: Record<string, string> };

export type PostAuthNavigator = {
  replacePath: (path: string) => void;
  replaceParams: (pathname: string, params: Record<string, string>) => void;
  replaceFallback: () => void;
};

export type RestoreDecision<T> =
  | { type: 'wait' }
  | { type: 'ignore' }
  | { type: 'drop' }
  | { type: 'restore'; formState: T; action?: string; clear: boolean; resume: boolean };

export type ResumeDecision =
  | { type: 'noop' }
  | { type: 'clear' }
  | { type: 'resume'; action?: string };

type DraftPayload = {
  formState?: unknown;
  action?: unknown;
  timestamp?: unknown;
  params?: unknown;
};

export function parseGuestFormDraft(raw: string | null | undefined): GuestFormDraft | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { path?: unknown; data?: unknown };
    if (!parsed || typeof parsed.path !== 'string' || parsed.path.trim().length === 0) {
      return null;
    }
    return { path: parsed.path, data: parsed.data };
  } catch {
    return null;
  }
}

export function serializeGuestFormDraft(draft: GuestFormDraft | null): string | null {
  if (!draft?.path) {
    return null;
  }
  return JSON.stringify({ path: draft.path, data: draft.data ?? null });
}

export async function readGuestFormDraft(
  storage: DraftStorage,
  key = GUEST_FORM_DRAFT_KEY,
): Promise<GuestFormDraft | null> {
  try {
    return parseGuestFormDraft(await storage.getItem(key));
  } catch {
    return null;
  }
}

export async function writeGuestFormDraft(
  storage: DraftStorage,
  draft: GuestFormDraft | null,
  key = GUEST_FORM_DRAFT_KEY,
): Promise<void> {
  const serialized = serializeGuestFormDraft(draft);
  if (!serialized) {
    await storage.removeItem(key);
    return;
  }
  await storage.setItem(key, serialized);
}

export function createMemoryDraftStorage(initial: Record<string, string> = {}): DraftStorage {
  const data: Record<string, string> = { ...initial };
  return {
    async getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async setItem(key, value) {
      data[key] = value;
    },
    async removeItem(key) {
      delete data[key];
    },
  };
}

export function guestDraftFilePath(directory: string, key: string): string {
  const safe = key.replace(/[^a-z0-9._-]/gi, '_');
  const base = directory.endsWith('/') ? directory : `${directory}/`;
  return `${base}${safe}.json`;
}

export function draftTimestamp(draft: GuestFormDraft | null): number | null {
  const data = draft?.data;
  if (!data || typeof data !== 'object') {
    return null;
  }
  const timestamp = (data as DraftPayload).timestamp;
  return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : null;
}

export function isDraftWithinWindow(
  draft: GuestFormDraft | null,
  windowMs: number,
  now = Date.now(),
): boolean {
  const timestamp = draftTimestamp(draft);
  if (timestamp === null) {
    return false;
  }
  const age = now - timestamp;
  return age <= windowMs && age >= -60_000;
}

export function isRestorableGuestFormDraft(draft: GuestFormDraft | null, now = Date.now()): boolean {
  return isDraftWithinWindow(draft, GUEST_FORM_RESTORE_WINDOW_MS, now);
}

export function isResumableGuestFormDraft(draft: GuestFormDraft | null, now = Date.now()): boolean {
  return isDraftWithinWindow(draft, GUEST_FORM_RESUME_WINDOW_MS, now);
}

function readPayload(draft: GuestFormDraft | null, expectedPath: string): DraftPayload | null {
  if (!draft || draft.path !== expectedPath || draft.data == null || typeof draft.data !== 'object') {
    return null;
  }
  return draft.data as DraftPayload;
}

export function resolvePostAuthNavigation(draft: GuestFormDraft | null): PostAuthNavigation {
  if (!draft?.path) {
    return { kind: 'fallback' };
  }

  const params = draft.data && typeof draft.data === 'object' ? (draft.data as DraftPayload).params : undefined;
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    const entries = Object.entries(params as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    );
    if (entries.length > 0) {
      const pathname = draft.path.startsWith('/') ? draft.path.slice(1) : draft.path;
      return { kind: 'params', pathname, params: Object.fromEntries(entries) };
    }
  }

  return { kind: 'path', path: draft.path };
}

export function applyPostAuthNavigation(draft: GuestFormDraft | null, navigate: PostAuthNavigator) {
  const decision = resolvePostAuthNavigation(draft);
  if (decision.kind === 'params') {
    navigate.replaceParams(decision.pathname, decision.params);
    return;
  }
  if (decision.kind === 'path') {
    navigate.replacePath(decision.path);
    return;
  }
  navigate.replaceFallback();
}

export function resolveSkipRoute(draft: GuestFormDraft | null, now = Date.now()): string {
  if (draft?.path && isResumableGuestFormDraft(draft, now)) {
    return draft.path;
  }
  return LOGGED_IN_HOME;
}

export function resolveLaunchRoute(options: {
  hasUser: boolean;
  draft: GuestFormDraft | null;
  now?: number;
}): string {
  const now = options.now ?? Date.now();
  if (options.draft?.path && isResumableGuestFormDraft(options.draft, now)) {
    return options.draft.path;
  }
  return options.hasUser ? LOGGED_IN_HOME : SIGN_IN_ROUTE;
}

export function sanitizeSearchParams(params: object): Record<string, string> | undefined {
  const sanitizedEntries: Array<[string, string]> = [];

  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        sanitizedEntries.push([key, trimmed]);
      }
      return;
    }

    if (Array.isArray(value)) {
      const candidate = value.find(item => typeof item === 'string' && item.trim().length > 0);
      if (typeof candidate === 'string') {
        sanitizedEntries.push([key, candidate.trim()]);
      }
    }
  });

  if (sanitizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(sanitizedEntries);
}

export function decideGuestFormRestore<T>(input: {
  hydrated: boolean;
  draft: GuestFormDraft | null;
  expectedPath: string;
  hasUser: boolean;
  now?: number;
}): RestoreDecision<T> {
  if (!input.hydrated) {
    return { type: 'wait' };
  }

  const now = input.now ?? Date.now();
  const payload = readPayload(input.draft, input.expectedPath);
  if (!input.draft || input.draft.path !== input.expectedPath) {
    return { type: 'ignore' };
  }

  if (!payload || payload.formState == null || typeof payload.formState !== 'object') {
    return { type: 'drop' };
  }

  if (!isRestorableGuestFormDraft(input.draft, now)) {
    return { type: 'drop' };
  }

  const action = typeof payload.action === 'string' ? payload.action : undefined;
  const resume = input.hasUser && Boolean(action) && isResumableGuestFormDraft(input.draft, now);

  return {
    type: 'restore',
    formState: payload.formState as T,
    action,
    clear: input.hasUser,
    resume,
  };
}

export function decideAuthenticatedResume(input: {
  hydrated: boolean;
  hasUser: boolean;
  draft: GuestFormDraft | null;
  expectedPath: string;
  now?: number;
}): ResumeDecision {
  if (!input.hydrated || !input.hasUser) {
    return { type: 'noop' };
  }

  const now = input.now ?? Date.now();
  const payload = readPayload(input.draft, input.expectedPath);
  if (!payload || payload.formState == null || typeof payload.formState !== 'object') {
    return { type: 'noop' };
  }

  if (!isRestorableGuestFormDraft(input.draft, now)) {
    return { type: 'clear' };
  }

  if (!isResumableGuestFormDraft(input.draft, now)) {
    return { type: 'clear' };
  }

  const action = typeof payload.action === 'string' ? payload.action : undefined;
  if (!action) {
    return { type: 'clear' };
  }

  return { type: 'resume', action };
}
