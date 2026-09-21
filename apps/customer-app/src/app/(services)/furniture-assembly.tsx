import { furnitureAssemblyServiceConfig } from './composer/serviceComposer.configs';
import SingleLocationServiceComposer from './composer/SingleLocationServiceComposer';

/** Furniture assembly request. Shared single-location composer; this file is the route entry. */
export default function FurnitureAssemblyScreen() {
  return <SingleLocationServiceComposer config={furnitureAssemblyServiceConfig} />;
}
