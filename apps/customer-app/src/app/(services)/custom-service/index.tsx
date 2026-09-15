import { ServiceRequestScreen } from '../../../components/services/composer';
import { customServiceConfig } from './custom-service.config';

export default function CustomService() {
  return <ServiceRequestScreen config={customServiceConfig} />;
}
