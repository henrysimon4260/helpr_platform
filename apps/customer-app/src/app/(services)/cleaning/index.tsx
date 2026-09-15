import { ServiceRequestScreen } from '../../../components/services/composer';
import { cleaningConfig } from './cleaning.config';

export default function Cleaning() {
  return <ServiceRequestScreen config={cleaningConfig} />;
}
