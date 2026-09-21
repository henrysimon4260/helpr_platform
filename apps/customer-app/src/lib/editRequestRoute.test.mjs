import { resolveEditRequestRoute } from './editRequestRoute.ts';

const moving = '/(services)/moving';
const cleaning = '/(services)/cleaning';
const furniture = '/(services)/furniture-assembly';
const home = '/(services)/home-improvement';
const wall = '/(services)/wall-mounting';
const custom = '/(services)/custom-service';

const cases = [
  // Values composers write today.
  ['cleaning', cleaning],
  ['furniture-assembly', furniture],
  ['home-improvement', home],
  ['wall-mounting', wall],
  ['customService', custom],
  ['Moving', moving],

  // Spaced aliases the old Edit Request map expected.
  ['furniture assembly', furniture],
  ['Furniture Assembly', furniture],
  ['home improvement', home],
  ['Home Improvement', home],
  ['wall mounting', wall],
  ['Wall Mounting', wall],
  ['running errands', custom],
  ['Running Errands', custom],
  ['custom', custom],
  ['Custom', custom],
  ['moving', moving],
  ['Cleaning', cleaning],

  // customService and separator variants.
  ['CustomService', custom],
  ['customservice', custom],
  ['custom-service', custom],
  ['custom_service', custom],
  ['custom service', custom],
  ['Custom Service', custom],
  ['furniture_assembly', furniture],
  ['home_improvement', home],
  ['wall_mounting', wall],
  ['running-errands', custom],
  ['running_errands', custom],
  ['  furniture-assembly  ', furniture],
  ['furniture  assembly', furniture],

  // Unknown values keep the previous custom-service fallback.
  [null, custom],
  [undefined, custom],
  ['', custom],
  ['   ', custom],
  ['unknown-type', custom],
];

for (const [input, expected] of cases) {
  const actual = resolveEditRequestRoute(input);
  if (actual !== expected) {
    throw new Error(
      `service_type ${JSON.stringify(input)} routed to ${actual}, expected ${expected}`,
    );
  }
}

console.log(`edit request routes: ${cases.length} aliases ok`);
