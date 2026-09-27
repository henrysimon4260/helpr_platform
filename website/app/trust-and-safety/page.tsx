import Link from "next/link";
import HelprHappinessArticle from "../components/helpr-happiness-article";
import LegalDisclaimer from "../components/legal-disclaimer";

export default function TrustAndSafetyPage() {
  return (
    <main className="min-h-screen bg-[#f7fbf7] text-slate-900">
      <header className="border-b border-[#d5e4d6] bg-white">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5">
          <Link href="/" className="text-2xl font-bold text-[#0e5a2a]">
            helpr
          </Link>
          <Link href="/terms" className="text-sm font-semibold text-[#0e5a2a]">
            Terms
          </Link>
        </div>
      </header>
      <article className="mx-auto w-full max-w-3xl px-5 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2d5a36]">
          Trust &amp; Safety
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-[#0e5a2a]">
          If a paid job goes wrong
        </h1>
        <p className="mt-4 leading-7 text-[#34523a]">
          Helpr Happiness is discretionary goodwill for property damage, theft,
          or a limited injury caused by a Helpr&apos;s negligence on a completed
          paid job. It is not insurance. Read the exclusions before you book,
          and file from that job in the app within 30 days.
        </p>
        <div className="mt-10">
          <HelprHappinessArticle />
        </div>
        <p className="mt-10 leading-7 text-[#34523a]">
          Operations reviews the file, the evidence, and the exclusions, then
          records an approval, a partial payment, a request for more
          information, or a denial. A card refund, when used, only returns
          money from that job&apos;s charge. It is not a payment dispute.
        </p>
      </article>
      <footer className="border-t border-[#d5e4d6]">
        <div className="mx-auto w-full max-w-3xl px-5 py-8">
          <nav className="flex flex-wrap gap-4 text-sm font-medium text-[#2f4832]">
            <Link href="/">Home</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/contact-us">Customer Support</Link>
          </nav>
          <LegalDisclaimer className="mt-6 text-[11px] leading-5 text-[#5a6855] [&>p+p]:mt-1" />
        </div>
      </footer>
    </main>
  );
}
