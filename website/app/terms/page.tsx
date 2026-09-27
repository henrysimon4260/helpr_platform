import Link from "next/link";
import HelprHappinessArticle from "../components/helpr-happiness-article";
import LegalDisclaimer from "../components/legal-disclaimer";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f7fbf7] text-slate-900">
      <header className="border-b border-[#d5e4d6] bg-white">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5">
          <Link href="/" className="text-2xl font-bold text-[#0e5a2a]">
            helpr
          </Link>
          <Link href="/trust-and-safety" className="text-sm font-semibold text-[#0e5a2a]">
            Trust &amp; Safety
          </Link>
        </div>
      </header>
      <article className="mx-auto w-full max-w-3xl px-5 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2d5a36]">
          Terms
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-[#0e5a2a]">Helpr Happiness</h1>
        <p className="mt-4 leading-7 text-[#34523a]">
          These terms describe Helpr Happiness, a discretionary goodwill program.
          It is not insurance. Marketplace booking terms can change; this page
          is the statement of how a Happiness request works.
        </p>
        <div className="mt-10">
          <HelprHappinessArticle />
        </div>
        <p className="mt-10 leading-7 text-[#34523a]">
          Questions about a request can go through in-app support. Billing
          questions about the job payment are handled separately and are not a
          Happiness request.
        </p>
      </article>
      <footer className="border-t border-[#d5e4d6]">
        <div className="mx-auto w-full max-w-3xl px-5 py-8">
          <nav className="flex flex-wrap gap-4 text-sm font-medium text-[#2f4832]">
            <Link href="/">Home</Link>
            <Link href="/trust-and-safety">Trust &amp; Safety</Link>
            <Link href="/contact-us">Customer Support</Link>
          </nav>
          <LegalDisclaimer className="mt-6 text-[11px] leading-5 text-[#5a6855] [&>p+p]:mt-1" />
        </div>
      </footer>
    </main>
  );
}
