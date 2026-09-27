/**
 * Public copy for Helpr Happiness. Discretionary goodwill, not insurance.
 * Keep the ceiling aligned with HELPR_HAPPINESS_CAP_CENTS in the customer app ($1,000).
 */

export const HAPPINESS_CAP_LABEL = '$1,000';

export const happinessSummary = `Helpr Happiness is discretionary goodwill from Helpr, up to ${HAPPINESS_CAP_LABEL}, for certain losses on a booked and paid job. It is not insurance. It is secondary to your own homeowner's or renter's insurance. Helpr may approve a request, pay part of it, or decline it.`;

export const happinessNotInsurance =
  'Helpr Happiness is discretionary goodwill. It is not insurance, and filing a request does not mean a loss will be paid.';

export const happinessEligibility = [
  'The job was booked in Helpr and paid.',
  'The job is completed.',
  'You report property damage, theft, or a limited injury from your Helpr\'s negligence during that job.',
  'You file within 30 days after the job is completed.',
  'You share what happened and evidence, such as photos, receipts, or a written account of the proof you have.',
];

export const happinessExclusions = [
  'Cars, trucks, motorcycles, boats, aircraft, and anything inside them.',
  'Cash, gift cards, cryptocurrency, and securities.',
  'Water, flood, sewage, mold, or weather.',
  'The ordinary result of the work you booked.',
  'Damage that comes from following your instructions.',
  'Damage or loss that was already there.',
  'Items you asked the Helpr to change, repair, move, or throw away, when the result matches that request.',
  'Indirect losses such as lost wages, missed work, or a hotel stay.',
  'Anything that happens outside the booked job.',
  'A request filed more than 30 days after the job is completed.',
];

export const happinessDecision =
  'Helpr reviews the request and records an outcome: pay the amount that fits the program (never above the cap), pay part of it, ask for more information, or decline it.';

export const happinessNotARefund =
  'This is separate from a billing refund or a card dispute. Those questions stay on the payment for the job.';
