import { useEffect, useRef } from 'react';

import { useAuth } from './AuthContext';
import { decideAuthenticatedResume, decideGuestFormRestore } from './guestFormDraft';

/**
 * Puts a saved composer draft back into the screen.
 * Guests keep the draft so leaving for Skip / sign-in can restore it again.
 * Signed-in users clear it, and a fresh draft continues Schedule.
 */
export function useGuestFormRestore<T>(options: {
  path: string;
  restoreFormState: (formState: T) => void;
  onResume?: (action: string | undefined) => void;
}) {
  const { path, restoreFormState, onResume } = options;
  const { user, getReturnTo, clearReturnTo, returnToHydrated } = useAuth();
  const restoredRef = useRef(false);
  const resumedRef = useRef(false);
  const restoreRef = useRef(restoreFormState);
  const resumeRef = useRef(onResume);
  restoreRef.current = restoreFormState;
  resumeRef.current = onResume;

  useEffect(() => {
    if (restoredRef.current || !returnToHydrated) {
      return;
    }

    const decision = decideGuestFormRestore<T>({
      hydrated: returnToHydrated,
      draft: getReturnTo(),
      expectedPath: path,
      hasUser: Boolean(user),
    });

    if (decision.type === 'wait') {
      return;
    }

    if (decision.type === 'ignore') {
      restoredRef.current = true;
      return;
    }

    if (decision.type === 'drop') {
      restoredRef.current = true;
      clearReturnTo();
      return;
    }

    restoreRef.current(decision.formState);
    restoredRef.current = true;

    if (decision.clear) {
      clearReturnTo();
    }

    if (decision.resume && !resumedRef.current) {
      resumedRef.current = true;
      resumeRef.current?.(decision.action);
    }
  }, [clearReturnTo, getReturnTo, path, returnToHydrated, user]);

  useEffect(() => {
    if (!returnToHydrated || !restoredRef.current || resumedRef.current || !user) {
      return;
    }

    const decision = decideAuthenticatedResume({
      hydrated: returnToHydrated,
      hasUser: true,
      draft: getReturnTo(),
      expectedPath: path,
    });

    if (decision.type === 'noop') {
      return;
    }

    clearReturnTo();
    if (decision.type === 'resume') {
      resumedRef.current = true;
      resumeRef.current?.(decision.action);
    }
  }, [clearReturnTo, getReturnTo, path, returnToHydrated, user]);
}
