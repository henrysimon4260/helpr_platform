/**
 * Maps complete-service failures to a non-200 response.
 * The body is only `{ success: false, error }` — never stack, Stripe raw
 * objects, or exception dumps. Full errors are logged here.
 */

export type CompletionFailure = {
  status: number;
  body: {
    success: false;
    error: string;
  };
};

const GENERIC_SERVER_MESSAGE = 'Failed to complete service';
const STRIPE_MESSAGE = 'Payment provider request failed';
const INVALID_BODY_MESSAGE = 'Invalid request body';

type MessageRule = {
  test: (message: string) => boolean;
  status: number;
};

/** Client / validation failures thrown by complete-service. Message is safe to return. */
const CLIENT_RULES: MessageRule[] = [
  { test: (message) => message === 'Missing required parameter: serviceId', status: 400 },
  { test: (message) => message.startsWith('Service is missing required fields'), status: 400 },
  { test: (message) => message === 'Provider has not completed payment setup', status: 400 },
  {
    test: (message) => message.startsWith('Payment must be authorized through customer app first'),
    status: 400,
  },
  { test: (message) => message === 'Service not found', status: 404 },
  { test: (message) => message === 'Provider not found', status: 404 },
  { test: (message) => message.startsWith('Payment requires customer action.'), status: 409 },
  { test: (message) => message.startsWith('Payment not authorized.'), status: 409 },
];

/** Server failures whose message is already safe (no SQL, paths, or secrets). */
const SERVER_RULES: MessageRule[] = [
  {
    test: (message) => message.startsWith('Payment captured but no charge ID found.'),
    status: 500,
  },
];

const STRIPE_ERROR_TYPES = new Set([
  'card_error',
  'invalid_request_error',
  'api_error',
  'idempotency_error',
  'rate_limit_error',
  'authentication_error',
  'permission_error',
  'validation_error',
]);

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

function isStripeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { type?: unknown; rawType?: unknown; name?: unknown };
  if (typeof candidate.rawType === 'string' && candidate.rawType.length > 0) return true;
  if (typeof candidate.type === 'string') {
    if (candidate.type.startsWith('Stripe') || STRIPE_ERROR_TYPES.has(candidate.type)) return true;
  }
  if (typeof candidate.name === 'string' && /^Stripe\w*Error$/.test(candidate.name)) return true;
  return false;
}

function matchRule(message: string, rules: MessageRule[]): MessageRule | undefined {
  return rules.find((rule) => rule.test(message));
}

export function completionFailure(error: unknown): CompletionFailure {
  console.error('Service completion error:', error);

  if (isStripeError(error)) {
    return { status: 502, body: { success: false, error: STRIPE_MESSAGE } };
  }

  if (error instanceof SyntaxError) {
    return { status: 400, body: { success: false, error: INVALID_BODY_MESSAGE } };
  }

  const message = errorMessage(error);
  const clientRule = matchRule(message, CLIENT_RULES);
  if (clientRule) {
    return { status: clientRule.status, body: { success: false, error: message } };
  }

  const serverRule = matchRule(message, SERVER_RULES);
  if (serverRule) {
    return { status: serverRule.status, body: { success: false, error: message } };
  }

  return { status: 500, body: { success: false, error: GENERIC_SERVER_MESSAGE } };
}
