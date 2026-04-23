import Link from "next/link";
import LegalDisclaimer from "../components/legal-disclaimer";

export default function ContactUsPage() {
  return (
    <main className="min-h-screen bg-[#f2f7f2] text-slate-900">
      <header className="border-b border-[#b5ccb8] bg-[#e8f2e8]">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:h-20 sm:items-end sm:px-6 sm:pb-4 md:px-10">
          <Link href="/" className="flex items-end gap-1.5 sm:gap-2">
            <span className="text-2xl font-bold tracking-tight text-[#0e5a2a] sm:text-4xl">
              helpr
            </span>
            <span className="mb-0 text-[10px] tracking-[0.16em] text-[#0e5a2a] sm:mb-1 sm:text-xs sm:tracking-[0.18em] [font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,Liberation_Mono,Courier_New,monospace]">
              customer care
            </span>
          </Link>
          <Link
            href="/contact-us-for-pros"
            className="rounded-lg border border-[#0e5a2a]/35 px-3 py-1.5 text-sm font-semibold text-[#0e5a2a] transition hover:bg-[#0e5a2a]/5 sm:px-4 sm:py-2"
          >
            <span className="sm:hidden">Pro Support</span>
            <span className="hidden sm:inline">Support for Service Providers</span>
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#285334]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.16),transparent_46%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(16,42,24,0.28),rgba(16,42,24,0.70))]" />
        <div className="relative mx-auto max-w-7xl px-5 py-14 sm:px-6 sm:py-20 md:px-10 md:py-24">
          <h1 className="max-w-3xl text-3xl font-bold leading-[1.15] text-[#f4f9f1] sm:text-4xl sm:leading-tight md:text-5xl">
            Get in Touch With Us
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#dcead9] sm:mt-4 sm:text-base md:text-lg">
            Need help with a booking, payment, or account question? Send us a
            message and our customer support team will follow up.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-14 md:px-10 md:py-16">
        <div className="max-w-2xl rounded-3xl border border-[#c3d6c4] bg-[#f8fcf8] p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2d5a36]">
            Customer Support
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[#1f4628]">
            Send Us a Message
          </h2>
          <p className="mt-2 text-sm text-[#4a6450]">
            For active booking or service completion issues, please use the
            in-app customer support agent for fastest help.
          </p>
          <p className="mt-1 text-xs text-[#5f7962]">
            Messages from this form are delivered to our internal support inbox.
          </p>

          <form action="/api/contact" method="post" className="mt-6 space-y-4">
            <input type="hidden" name="supportType" value="customer" />
            <input type="hidden" name="redirectTo" value="/contact-us" />
            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-sm font-medium text-[#1c3f23]"
              >
                Your Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                className="w-full rounded-xl border border-[#c5d6c6] bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#3f7449] focus:ring-2 focus:ring-[#3f7449]/20"
                required
              />
            </div>

            <div>
              <label
                htmlFor="message"
                className="mb-1 block text-sm font-medium text-[#1c3f23]"
              >
                Message
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                placeholder="Tell us how we can help..."
                className="w-full rounded-xl border border-[#c5d6c6] bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#3f7449] focus:ring-2 focus:ring-[#3f7449]/20"
                required
              />
            </div>

            <button
              type="submit"
              className="rounded-xl bg-[#1f4d2c] px-5 py-2.5 text-sm font-semibold text-[#f1f7ed] transition hover:bg-[#173a21]"
            >
              Submit Message
            </button>
          </form>
        </div>
      </section>
      <footer className="border-t border-[#c3d6c4] bg-[#edf5ed]">
        <div className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-6 sm:py-8 md:px-10">
          <div className="flex flex-col gap-6 text-center sm:gap-5 sm:text-left md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col items-center gap-0.5 sm:items-start">
              <p className="text-2xl font-bold tracking-[-0.01em] text-[#0e5a2a]">
                helpr
              </p>
              <p className="text-sm text-[#4d6652]">
                Fast customer support for every booking stage.
              </p>
            </div>
            <nav className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm font-medium text-[#2f4832] sm:flex sm:flex-wrap sm:items-center sm:gap-y-2">
              <Link href="/">Home</Link>
              <Link href="/become-a-pro">Become a Pro</Link>
              <Link href="/contact-us">Customer Support</Link>
              <Link href="/contact-us-for-pros">Support for Pros</Link>
            </nav>
          </div>
          <LegalDisclaimer className="mt-6 border-t border-[#c3d6c4] pt-4 text-[11px] leading-5 text-[#4d6652] [&>p+p]:mt-1" />
        </div>
      </footer>
    </main>
  );
}
