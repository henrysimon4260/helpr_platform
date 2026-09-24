const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;

/**
 * Normalize a phone number to E.164.
 * A leading + is kept as an international number.
 * 10 digits are treated as US/CA and prefixed with +1.
 * 11 digits starting with the default country code are prefixed with +.
 * Anything else is rejected so we do not guess a country code.
 */
export function normalizeE164(input: string, defaultCountryCallingCode = '1'): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (hasPlus) {
    if (digits.length < E164_MIN_DIGITS || digits.length > E164_MAX_DIGITS) return null;
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+${defaultCountryCallingCode}${digits}`;
  }

  if (digits.length === 11 && digits.startsWith(defaultCountryCallingCode)) {
    return `+${digits}`;
  }

  return null;
}
