import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HELPR_HAPPINESS_CAP_CENTS,
  HELPR_HAPPINESS_CLAIM_WINDOW_DAYS,
  customerFacingCopy,
  dollarsToRequestedCents,
  evaluateHappinessEligibility,
  findProhibitedInsuranceLanguage,
  formatPledgeCap,
} from './policy.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../../../');

test('customer copy never implies licensed insurance', () => {
  const hits = customerFacingCopy().flatMap((line) => findProhibitedInsuranceLanguage(line));
  assert.deepEqual(hits, []);
  const joined = customerFacingCopy().join('\n');
  assert.match(joined, /not insurance/i);
  assert.match(joined, /secondary/i);
  assert.match(joined, /homeowner/i);
  assert.match(joined, /\$1,000/);
  assert.match(joined, new RegExp(`${HELPR_HAPPINESS_CLAIM_WINDOW_DAYS} days`));
});

test('public pages use the same cap and do not imply insurance', () => {
  const website = readFileSync(join(repoRoot, 'website/lib/helpr-happiness.ts'), 'utf8');
  const terms = readFileSync(join(repoRoot, 'website/app/terms/page.tsx'), 'utf8');
  const trust = readFileSync(join(repoRoot, 'website/app/trust-and-safety/page.tsx'), 'utf8');
  const article = readFileSync(join(repoRoot, 'website/app/components/helpr-happiness-article.tsx'), 'utf8');
  const disclaimer = readFileSync(join(repoRoot, 'website/app/components/legal-disclaimer.tsx'), 'utf8');
  const claimScreen = readFileSync(join(repoRoot, 'apps/customer-app/src/app/(booking-flow)/happiness-claim.tsx'), 'utf8');
  const trustScreen = readFileSync(join(repoRoot, 'apps/customer-app/src/app/(booking-flow)/helpr-happiness.tsx'), 'utf8');
  const serviceDetails = readFileSync(join(repoRoot, 'apps/customer-app/src/app/(booking-flow)/service-details.tsx'), 'utf8');
  for (const source of [website, terms, trust, article, disclaimer, claimScreen, trustScreen, serviceDetails]) {
    assert.deepEqual(findProhibitedInsuranceLanguage(source), []);
  }
  for (const source of [website, terms, trust, disclaimer]) {
    assert.match(source, /not insurance/i);
  }
  assert.match(website, new RegExp(formatPledgeCap().replace('$', '\\$')));
  assert.match(website, /secondary/i);
  assert.match(website, /30 days/);
});

test('eligibility requires a completed paid job inside 30 days', () => {
  const completedAt = '2026-09-01T12:00:00.000Z';
  const inside = evaluateHappinessEligibility({
    status: 'completed',
    paymentStatus: 'paid',
    completedAt,
    createdAt: '2026-01-01T00:00:00.000Z',
    now: new Date('2026-09-20T12:00:00.000Z'),
  });
  assert.equal(inside.ok, true);

  const onTheDay = evaluateHappinessEligibility({
    status: 'Completed',
    paymentStatus: 'paid',
    completedAt,
    now: new Date(new Date(completedAt).getTime() + HELPR_HAPPINESS_CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000),
  });
  assert.equal(onTheDay.ok, true);

  const late = evaluateHappinessEligibility({
    status: 'completed',
    paymentStatus: 'paid',
    completedAt,
    now: new Date(new Date(completedAt).getTime() + HELPR_HAPPINESS_CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000 + 1),
  });
  assert.equal(late.ok, false);

  const usesCreationWhenCompletionMissing = evaluateHappinessEligibility({
    status: 'completed',
    paymentStatus: 'paid',
    createdAt: '2026-09-10T00:00:00.000Z',
    now: new Date('2026-09-12T00:00:00.000Z'),
  });
  assert.equal(usesCreationWhenCompletionMissing.ok, true);

  assert.equal(
    evaluateHappinessEligibility({
      status: 'in_progress',
      paymentStatus: 'paid',
      completedAt,
      now: new Date(completedAt),
    }).ok,
    false,
  );
  assert.equal(
    evaluateHappinessEligibility({
      status: 'completed',
      paymentStatus: 'authorized',
      completedAt,
      now: new Date(completedAt),
    }).ok,
    false,
  );
});

test('requested amounts stay inside the cap', () => {
  assert.equal(dollarsToRequestedCents(1000), HELPR_HAPPINESS_CAP_CENTS);
  assert.equal(dollarsToRequestedCents(1000.004), HELPR_HAPPINESS_CAP_CENTS);
  assert.equal(dollarsToRequestedCents(1000.01), null);
  assert.equal(dollarsToRequestedCents(0), null);
  assert.equal(dollarsToRequestedCents(12.5), 1250);
});
