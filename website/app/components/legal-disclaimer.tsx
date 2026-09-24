type LegalDisclaimerProps = {
  className?: string;
  includeAvailabilityNotice?: boolean;
  includeProOnboardingNotice?: boolean;
};

export default function LegalDisclaimer({
  className,
  includeAvailabilityNotice = true,
  includeProOnboardingNotice = false,
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
          Pros cannot accept paid work until a Checkr background check is
          clear. Consider results are not approved. Stripe payout verification
          does not replace the background check.
        </p>
      ) : null}
    </div>
  );
}
