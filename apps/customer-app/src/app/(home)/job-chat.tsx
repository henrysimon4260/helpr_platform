import { useLocalSearchParams } from 'expo-router';
import { JobThread } from '../../components/job/JobThread';

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

export default function JobChatScreen() {
  const params = useLocalSearchParams<{ serviceId?: string | string[] }>();
  return <JobThread serviceId={one(params.serviceId)} />;
}
