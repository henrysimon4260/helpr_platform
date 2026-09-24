import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyPostAuthNavigation,
  createMemoryDraftStorage,
  decideAuthenticatedResume,
  decideGuestFormRestore,
  GUEST_FORM_DRAFT_KEY,
  guestDraftFilePath,
  isResumableGuestFormDraft,
  isRestorableGuestFormDraft,
  LOGGED_IN_HOME,
  parseGuestFormDraft,
  readGuestFormDraft,
  resolveLaunchRoute,
  resolvePostAuthNavigation,
  resolveSkipRoute,
  sanitizeSearchParams,
  serializeGuestFormDraft,
  SIGN_IN_ROUTE,
  writeGuestFormDraft,
} from './guestFormDraft.ts';

const NOW = 1_700_000_000_000;

function draft(ageMs: number, path = '/(services)/moving', action = 'schedule-moving') {
  return {
    path,
    data: {
      formState: { description: 'Two bedroom move' },
      action,
      timestamp: NOW - ageMs,
    },
  };
}

test('parse and serialize round-trip a draft and reject junk', () => {
  const saved = draft(0);
  assert.deepEqual(parseGuestFormDraft(serializeGuestFormDraft(saved)), {
    path: saved.path,
    data: saved.data,
  });
  assert.equal(parseGuestFormDraft('not-json'), null);
  assert.equal(parseGuestFormDraft(JSON.stringify({ path: '  ' })), null);
  assert.equal(parseGuestFormDraft(null), null);
  assert.equal(serializeGuestFormDraft(null), null);
});

test('memory storage keeps the draft across a read after write', async () => {
  const storage = createMemoryDraftStorage();
  await writeGuestFormDraft(storage, draft(0));
  assert.deepEqual(await readGuestFormDraft(storage), {
    path: '/(services)/moving',
    data: draft(0).data,
  });
  await writeGuestFormDraft(storage, null);
  assert.equal(await storage.getItem(GUEST_FORM_DRAFT_KEY), null);
});

test('file path is stable and sanitized', () => {
  assert.equal(
    guestDraftFilePath('file:///docs', GUEST_FORM_DRAFT_KEY),
    'file:///docs/helpr.guestFormDraft.v1.json',
  );
});

test('post-auth navigation returns to the composer and keeps route params', () => {
  assert.deepEqual(resolvePostAuthNavigation(null), { kind: 'fallback' });
  assert.deepEqual(resolvePostAuthNavigation(draft(0)), {
    kind: 'path',
    path: '/(services)/moving',
  });

  const withParams = {
    path: '/(services)/cleaning',
    data: { formState: { description: 'kitchen' }, params: { editServiceId: 'abc', skip: 1 } },
  };
  assert.deepEqual(resolvePostAuthNavigation(withParams), {
    kind: 'params',
    pathname: '(services)/cleaning',
    params: { editServiceId: 'abc' },
  });

  const calls: string[] = [];
  applyPostAuthNavigation(draft(0), {
    replacePath: path => calls.push(`path:${path}`),
    replaceParams: pathname => calls.push(`params:${pathname}`),
    replaceFallback: () => calls.push('fallback'),
  });
  applyPostAuthNavigation(null, {
    replacePath: path => calls.push(`path:${path}`),
    replaceParams: pathname => calls.push(`params:${pathname}`),
    replaceFallback: () => calls.push('fallback'),
  });
  assert.deepEqual(calls, ['path:/(services)/moving', 'fallback']);
});

test('skip and cold start return to a fresh draft, otherwise catalog or login', () => {
  assert.equal(resolveSkipRoute(null, NOW), LOGGED_IN_HOME);
  assert.equal(resolveSkipRoute(draft(60_000), NOW), '/(services)/moving');
  assert.equal(resolveSkipRoute(draft(2 * 60 * 60 * 1000), NOW), LOGGED_IN_HOME);

  assert.equal(resolveLaunchRoute({ hasUser: false, draft: null, now: NOW }), SIGN_IN_ROUTE);
  assert.equal(resolveLaunchRoute({ hasUser: true, draft: null, now: NOW }), LOGGED_IN_HOME);
  assert.equal(
    resolveLaunchRoute({ hasUser: true, draft: draft(60_000), now: NOW }),
    '/(services)/moving',
  );
  assert.equal(
    resolveLaunchRoute({ hasUser: false, draft: draft(2 * 60 * 60 * 1000), now: NOW }),
    SIGN_IN_ROUTE,
  );
});

test('guest restore keeps the draft; sign-in resumes only while the draft is fresh', () => {
  const guest = decideGuestFormRestore({
    hydrated: true,
    draft: draft(1_000),
    expectedPath: '/(services)/moving',
    hasUser: false,
    now: NOW,
  });
  assert.equal(guest.type, 'restore');
  if (guest.type === 'restore') {
    assert.equal(guest.clear, false);
    assert.equal(guest.resume, false);
    assert.equal(guest.action, 'schedule-moving');
  }

  const signedIn = decideGuestFormRestore({
    hydrated: true,
    draft: draft(1_000),
    expectedPath: '/(services)/moving',
    hasUser: true,
    now: NOW,
  });
  assert.equal(signedIn.type, 'restore');
  if (signedIn.type === 'restore') {
    assert.equal(signedIn.clear, true);
    assert.equal(signedIn.resume, true);
  }

  const stale = decideGuestFormRestore({
    hydrated: true,
    draft: draft(2 * 60 * 60 * 1000),
    expectedPath: '/(services)/moving',
    hasUser: true,
    now: NOW,
  });
  assert.equal(stale.type, 'restore');
  if (stale.type === 'restore') {
    assert.equal(stale.resume, false);
    assert.equal(stale.clear, true);
  }

  assert.equal(
    decideGuestFormRestore({
      hydrated: false,
      draft: draft(0),
      expectedPath: '/(services)/moving',
      hasUser: true,
      now: NOW,
    }).type,
    'wait',
  );
  assert.equal(
    decideGuestFormRestore({
      hydrated: true,
      draft: draft(0, '/(services)/cleaning'),
      expectedPath: '/(services)/moving',
      hasUser: false,
      now: NOW,
    }).type,
    'ignore',
  );
  assert.equal(
    decideGuestFormRestore({
      hydrated: true,
      draft: draft(13 * 60 * 60 * 1000),
      expectedPath: '/(services)/moving',
      hasUser: false,
      now: NOW,
    }).type,
    'drop',
  );
});

test('authenticated resume fires after a guest restore once the user exists', () => {
  assert.deepEqual(
    decideAuthenticatedResume({
      hydrated: true,
      hasUser: false,
      draft: draft(1_000),
      expectedPath: '/(services)/moving',
      now: NOW,
    }),
    { type: 'noop' },
  );
  assert.deepEqual(
    decideAuthenticatedResume({
      hydrated: true,
      hasUser: true,
      draft: draft(1_000),
      expectedPath: '/(services)/moving',
      now: NOW,
    }),
    { type: 'resume', action: 'schedule-moving' },
  );
  assert.deepEqual(
    decideAuthenticatedResume({
      hydrated: true,
      hasUser: true,
      draft: draft(2 * 60 * 60 * 1000),
      expectedPath: '/(services)/moving',
      now: NOW,
    }),
    { type: 'clear' },
  );
});

test('windows and search params', () => {
  assert.equal(isResumableGuestFormDraft(draft(29 * 60 * 1000), NOW), true);
  assert.equal(isResumableGuestFormDraft(draft(31 * 60 * 1000), NOW), false);
  assert.equal(isRestorableGuestFormDraft(draft(11 * 60 * 60 * 1000), NOW), true);
  assert.equal(isRestorableGuestFormDraft(draft(13 * 60 * 60 * 1000), NOW), false);
  assert.deepEqual(sanitizeSearchParams({ editServiceId: ' abc ', empty: '  ', list: ['', 'id'] }), {
    editServiceId: 'abc',
    list: 'id',
  });
  assert.equal(sanitizeSearchParams({}), undefined);
});
