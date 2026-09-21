import { customServiceConfig } from './composer/serviceComposer.configs';
import RouteServiceComposer from './composer/RouteServiceComposer';

/** Custom service request. Shared route composer; this file is the route entry. */
export default function CustomServiceScreen() {
  return <RouteServiceComposer config={customServiceConfig} />;
}
