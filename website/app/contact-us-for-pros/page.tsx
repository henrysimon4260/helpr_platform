import Link from "next/link";
import LegalDisclaimer from "../components/legal-disclaimer";

export default function ContactUsForProsPage() {
  return (
    <main className="min-h-screen bg-[#f6efdf] text-slate-900">
      <header className="border-b border-[#d8ccb2] bg-[#f7f1e4]">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-6 md:px-10">
          <Link href="/become-a-pro" className="flex items-end gap-2">
            <span className="text-4xl font-bold text-[#0e5a2a]">helpr</span>
            <span className="pb-1 text-xs tracking-[0.18em] text-[#0e5a2a] [font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,Liberation_Mono,Courier_New,monospace]">
              for Pros
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/become-a-pro#download"
              className="rounded-lg border border-[#0e5a2a]/35 px-4 py-2 text-sm font-semibold text-[#0e5a2a] transition hover:bg-[#0e5a2a]/5"
            >
              Download
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#2f5b35]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.16),transparent_44%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(20,48,27,0.32),rgba(20,48,27,0.74))]" />
        <div className="relative mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-24">
          <h1 className="max-w-3xl text-4xl font-bold leading-tight text-[#f8f0e2] md:text-5xl">
            Get in Touch With Us
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-[#efe3cf] md:text-lg">
            We are here to help with account setup, onboarding questions, and
            general platform support.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-14 md:px-10 md:py-16">
        <div className="max-w-2xl rounded-3xl border border-[#dbcdb1] bg-[#fff8ea] p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#3e5b3f]">
            Contact Submission
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[#234128]">
            Send Us a Message
          </h2>
          <p className="mt-2 text-sm text-[#4b5f4a]">
            For service completion support, please use the in-app customer
            support agent.
          </p>
          <p className="mt-1 text-xs text-[#61745f]">
            Messages from this form are sent to our internal support inbox.
          </p>

          <form action="/api/contact" method="post" className="mt-6 space-y-4">
            <input type="hidden" name="supportType" value="pro" />
            <input type="hidden" name="redirectTo" value="/contact-us-for-pros" />
            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-sm font-medium text-[#1f3a24]"
              >
                Your Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                className="w-full rounded-xl border border-[#d8ccb2] bg-[#fffdf7] px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#527154] focus:ring-2 focus:ring-[#527154]/20"
                required
              />
            </div>

            <div>
              <label
                htmlFor="message"
                className="mb-1 block text-sm font-medium text-[#1f3a24]"
              >
                Message
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                placeholder="Tell us how we can help..."
                className="w-full rounded-xl border border-[#d8ccb2] bg-[#fffdf7] px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#527154] focus:ring-2 focus:ring-[#527154]/20"
                required
              />
            </div>

            <button
              type="submit"
              className="rounded-xl bg-[#1f3c25] px-5 py-2.5 text-sm font-semibold text-[#f5ecda] transition hover:bg-[#17311e]"
            >
              Submit Message
            </button>
          </form>
        </div>
      </section>
      <section className="border-t border-[#dbcdb1] bg-[#f5eddc]">
        <div className="mx-auto w-full max-w-7xl px-6 py-6 md:px-10">
          <LegalDisclaimer
            className="text-xs leading-5 text-[#5b6b58]"
            includeProOnboardingNotice
          />
        </div>
      </section>
    </main>
  );
}
