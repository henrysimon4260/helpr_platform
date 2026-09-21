import { homeImprovementServiceConfig } from './composer/serviceComposer.configs';
import SingleLocationServiceComposer from './composer/SingleLocationServiceComposer';

/** Home improvement request. Shared single-location composer; this file is the route entry. */
export default function HomeImprovementScreen() {
  return <SingleLocationServiceComposer config={homeImprovementServiceConfig} />;
}
