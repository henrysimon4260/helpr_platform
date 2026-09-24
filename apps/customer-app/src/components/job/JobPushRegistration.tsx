import { useEffect } from 'react';
import { registerDevicePushToken } from '../../lib/jobChat';
import { useJobParty } from './useJobParty';

export function JobPushRegistration() {
  const { ownerId, ready, role } = useJobParty();

  useEffect(() => {
    if (!ready || !ownerId) {
      return;
    }
    registerDevicePushToken(role, ownerId);
  }, [ownerId, ready, role]);

  return null;
}
