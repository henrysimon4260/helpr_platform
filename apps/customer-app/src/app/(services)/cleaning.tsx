import { cleaningServiceConfig } from './composer/serviceComposer.configs';
import SingleLocationServiceComposer from './composer/SingleLocationServiceComposer';

/** Cleaning request. Shared single-location composer; this file is the route entry. */
export default function CleaningScreen() {
  return <SingleLocationServiceComposer config={cleaningServiceConfig} />;
}
