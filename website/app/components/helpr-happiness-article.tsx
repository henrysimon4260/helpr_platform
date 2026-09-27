import {
  happinessDecision,
  happinessEligibility,
  happinessExclusions,
  happinessNotARefund,
  happinessNotInsurance,
  happinessSummary,
  HAPPINESS_CAP_LABEL,
} from "../../lib/helpr-happiness";

export default function HelprHappinessArticle() {
  return (
    <article className="space-y-8 text-[#1c3b24]">
      <p className="text-lg leading-8">{happinessNotInsurance}</p>
      <p className="leading-7 text-[#34523a]">{happinessSummary}</p>

      <section>
        <h2 className="text-2xl font-semibold text-[#0e5a2a]">Goodwill ceiling</h2>
        <p className="mt-3 leading-7 text-[#34523a]">
          Helpr may pay up to {HAPPINESS_CAP_LABEL} for a request that fits this
          program. That figure is a ceiling on goodwill. It is not insurance.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-[#0e5a2a]">
          When a request can be filed
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-7 text-[#34523a]">
          {happinessEligibility.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-[#0e5a2a]">What is not included</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-7 text-[#34523a]">
          {happinessExclusions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-[#0e5a2a]">How a decision is made</h2>
        <p className="mt-3 leading-7 text-[#34523a]">{happinessDecision}</p>
        <p className="mt-3 leading-7 text-[#34523a]">{happinessNotARefund}</p>
        <p className="mt-3 leading-7 text-[#34523a]">
          In the Helpr app, open a completed paid job and choose Request Helpr
          Happiness. Any help is secondary to your own homeowner&apos;s or
          renter&apos;s insurance.
        </p>
      </section>
    </article>
  );
}
