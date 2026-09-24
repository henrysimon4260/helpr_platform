import { useAuth } from '../../contexts/AuthContext';

export const JOB_ALERTS_PATH = '/job-alerts';
export const JOB_CHAT_PATH = '/job-chat';
export const JOB_PARTY_ROLE = 'provider' as const;

export function useJobParty() {
  const { user, loading } = useAuth();
  return {
    ownerId: user?.id ?? null,
    ready: !loading,
    role: JOB_PARTY_ROLE,
  };
}
