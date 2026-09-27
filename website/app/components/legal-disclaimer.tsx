type LegalDisclaimerProps = {
  className?: string;
  includeAvailabilityNotice?: boolean;
  includeProOnboardingNotice?: boolean;
  includeHappinessNotice?: boolean;
};

export default function LegalDisclaimer({
  className,
  includeAvailabilityNotice = true,
  includeProOnboardingNotice = false,
  includeHappinessNotice = false,
}: LegalDisclaimerProps) {
  return (
    <div className={className}>
      <p>Helpr Services LLC 2026 All Rights Reserved</p>
      {includeAvailabilityNotice ? (
        <p>
          Service availability, pricing, and response times vary by market and
          are subject to change.
        </p>
      ) : null}
      {includeProOnboardingNotice ? (
        <p>
          Pro onboarding and activation are subject to verification checks,
          safety requirements, and acceptance of platform terms.
        </p>
      ) : null}
      {includeHappinessNotice ? (
        <p>
          Helpr Happiness is discretionary goodwill, up to $1,000, and is not insurance.
        </p>
      ) : null}
    </div>
  );
}
