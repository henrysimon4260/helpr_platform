import { router } from 'expo-router';

import { applyPostAuthNavigation, GuestFormDraft, LOGGED_IN_HOME } from '../../context/guestFormDraft';

export function redirectToSavedDraft(draft: GuestFormDraft | null) {
  applyPostAuthNavigation(draft, {
    replacePath: path => {
      router.replace(path as any);
    },
    replaceParams: (pathname, params) => {
      router.replace({ pathname: pathname as any, params });
    },
    replaceFallback: () => {
      router.replace(LOGGED_IN_HOME as any);
    },
  });
}
