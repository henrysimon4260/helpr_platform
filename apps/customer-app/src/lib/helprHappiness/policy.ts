/**
 * Helpr Happiness — discretionary goodwill. Not insurance.
 * Cap and window are the product constants. Do not invent a second cap in UI copy.
 */

export const HELPR_HAPPINESS_PROGRAM_NAME = 'Helpr Happiness';
export const HELPR_HAPPINESS_CAP_CENTS = 100_000;
export const HELPR_HAPPINESS_CLAIM_WINDOW_DAYS = 30;
export const HELPR_HAPPINESS_EVIDENCE_BUCKET = 'happiness-claim-evidence';

export const HAPPINESS_INCIDENT_TYPES = [
  'property_damage',
  'theft',
  'limited_injury',
] as const;

export type HappinessIncidentType = (typeof HAPPINESS_INCIDENT_TYPES)[number];

export const HAPPINESS_INCIDENT_LABELS: Record<HappinessIncidentType, string> = {
  property_damage: 'Property damage',
  theft: 'Theft',
  limited_injury: 'Limited injury',
};

export type HappinessExclusion = {
  id: string;
  summary: string;
};

export const HAPPINESS_EXCLUSIONS: HappinessExclusion[] = [
  {
    id: 'vehicles',
    summary: 'Cars, trucks, motorcycles, boats, aircraft, and anything inside them.',
  },
  {
    id: 'cash',
    summary: 'Cash, gift cards, cryptocurrency, and securities.',
  },
  {
    id: 'water',
    summary: 'Water, flood, sewage, mold, or weather.',
  },
  {
    id: 'ordinary_result',
    summary: 'The ordinary result of the work you booked.',
  },
  {
    id: 'client_instructions',
    summary: 'Damage that comes from following your instructions.',
  },
  {
    id: 'preexisting',
    summary: 'Damage or loss that was already there.',
  },
  {
    id: 'requested_work',
    summary:
      'Items you asked the Helpr to change, repair, move, or throw away, when the result matches that request.',
  },
  {
    id: 'indirect',
    summary: 'Indirect losses such as lost wages, missed work, or a hotel stay.',
  },
  {
    id: 'outside_job',
    summary: 'Anything that happens outside the booked job.',
  },
  {
    id: 'late',
    summary: 'A request filed more than 30 days after the job is completed.',
  },
];

export function formatUsdFromCents(cents: number): string {
  const dollars = cents / 100;
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(dollars);
}

export function formatPledgeCap(): string {
  return formatUsdFromCents(HELPR_HAPPINESS_CAP_CENTS);
}

const capLabel = formatPledgeCap();
const windowLabel = `${HELPR_HAPPINESS_CLAIM_WINDOW_DAYS} days`;

export const HAPPINESS_COPY = {
  shortNotice: `${HELPR_HAPPINESS_PROGRAM_NAME} is discretionary goodwill from Helpr, up to ${capLabel}, for certain losses on a booked and paid job. It is not insurance. It is secondary to your own homeowner's or renter's insurance. Helpr may approve a request, pay part of it, or decline it.`,
  notInsurance: `${HELPR_HAPPINESS_PROGRAM_NAME} is discretionary goodwill. It is not insurance, and filing a request does not mean a loss will be paid.`,
  secondary: `Any help is secondary to your own homeowner's or renter's insurance. Ask that insurer first when the loss may fall under that policy.`,
  eligibilityIntro: 'A request can be considered only when all of the following are true.',
  eligibility: [
    'The job was booked in Helpr and paid.',
    'The job is completed.',
    'You report property damage, theft, or a limited injury from your Helpr\'s negligence during that job.',
    `You file within ${windowLabel} after the job is completed.`,
    'You share what happened and evidence, such as photos, receipts, or a written account of the proof you have.',
  ],
  decision: 'Helpr reviews the request and records an outcome: pay the amount that fits the program (never above the cap), pay part of it, ask for more information, or decline it.',
  distinctFromRefunds:
    'This is separate from a billing refund or a card dispute. Those questions stay on the payment for the job.',
  checkoutHint: `Before you pay: ${HELPR_HAPPINESS_PROGRAM_NAME} may offer discretionary goodwill up to ${capLabel} after a completed paid job. It is not insurance.`,
  claimCta: `Request ${HELPR_HAPPINESS_PROGRAM_NAME}`,
  unpaidHint: `${HELPR_HAPPINESS_PROGRAM_NAME} requests are only for booked jobs that were paid in the app.`,
  ackNotInsurance: 'I understand this is discretionary goodwill and it is not insurance.',
  ackSecondary: 'I understand any help is secondary to my own homeowner\'s or renter\'s insurance.',
  ackExclusions: 'I have read the exclusions and this request does not fall under them.',
  ackNegligence: 'This loss was caused by the Helpr\'s negligence during this booked job.',
} as const;

export function customerFacingCopy(): string[] {
  return [
    HAPPINESS_COPY.shortNotice,
    HAPPINESS_COPY.notInsurance,
    HAPPINESS_COPY.secondary,
    HAPPINESS_COPY.eligibilityIntro,
    ...HAPPINESS_COPY.eligibility,
    HAPPINESS_COPY.decision,
    HAPPINESS_COPY.distinctFromRefunds,
    HAPPINESS_COPY.checkoutHint,
    HAPPINESS_COPY.claimCta,
    HAPPINESS_COPY.unpaidHint,
    HAPPINESS_COPY.ackNotInsurance,
    HAPPINESS_COPY.ackSecondary,
    HAPPINESS_COPY.ackExclusions,
    HAPPINESS_COPY.ackNegligence,
    ...HAPPINESS_EXCLUSIONS.map((item) => item.summary),
    ...Object.values(HAPPINESS_INCIDENT_LABELS),
  ];
}

const INSURANCE_SENTENCE_OK =
  /\bnot\b[^.]{0,60}insurance|\bnever\b[^.]{0,80}insurance|\bdo not\b[^.]{0,80}insurance|homeowner|renter|your own|your insurer|own insurer/i;

export function findProhibitedInsuranceLanguage(text: string): string[] {
  const hits: string[] = [];
  if (/\binsured\b/i.test(text)) hits.push('insured');
  if (/guaranteed up to/i.test(text)) hits.push('guaranteed up to');
  if (/coverage up to/i.test(text)) hits.push('coverage up to');
  if (/policy limit/i.test(text)) hits.push('policy limit');
  if (/fully covered/i.test(text)) hits.push('fully covered');
  if (/\bour insurance\b/i.test(text)) hits.push('our insurance');
  if (/helpr insurance/i.test(text)) hits.push('helpr insurance');

  const chunks = text.split(/\n|(?<=[.!?])\s+/);
  for (const chunk of chunks) {
    if (!/\binsurance\b/i.test(chunk)) continue;
    if (!INSURANCE_SENTENCE_OK.test(chunk)) {
      hits.push(`unqualified insurance: ${chunk.trim().slice(0, 90)}`);
    }
  }
  return hits;
}

export type EligibilityInput = {
  status?: string | null;
  paymentStatus?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  now?: Date;
};

export type EligibilityResult =
  | { ok: true; windowAnchorIso: string; deadlineIso: string }
  | { ok: false; reason: string };

const WINDOW_MS = HELPR_HAPPINESS_CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function evaluateHappinessEligibility(input: EligibilityInput): EligibilityResult {
  const status = input.status?.trim().toLowerCase() ?? '';
  if (status !== 'completed') {
    return { ok: false, reason: 'Helpr Happiness can be requested after the job is completed.' };
  }
  if (input.paymentStatus !== 'paid') {
    return { ok: false, reason: HAPPINESS_COPY.unpaidHint };
  }

  const anchorRaw = input.completedAt?.trim() || input.createdAt?.trim() || '';
  const anchor = new Date(anchorRaw);
  if (!anchorRaw || Number.isNaN(anchor.getTime())) {
    return { ok: false, reason: 'This job has no completion date, so a request cannot be opened.' };
  }

  const now = input.now ?? new Date();
  const deadline = new Date(anchor.getTime() + WINDOW_MS);
  if (now.getTime() - anchor.getTime() > WINDOW_MS) {
    return {
      ok: false,
      reason: `The ${HELPR_HAPPINESS_CLAIM_WINDOW_DAYS}-day request window for this job has closed.`,
    };
  }

  return {
    ok: true,
    windowAnchorIso: anchor.toISOString(),
    deadlineIso: deadline.toISOString(),
  };
}

export function dollarsToRequestedCents(dollars: number): number | null {
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  const cents = Math.round(dollars * 100);
  if (cents < 1 || cents > HELPR_HAPPINESS_CAP_CENTS) return null;
  return cents;
}
