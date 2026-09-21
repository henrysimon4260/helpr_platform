import { wallMountingServiceConfig } from './composer/serviceComposer.configs';
import SingleLocationServiceComposer from './composer/SingleLocationServiceComposer';

/** Wall mounting request. Shared single-location composer; this file is the route entry. */
export default function WallMountingScreen() {
  return <SingleLocationServiceComposer config={wallMountingServiceConfig} />;
}
