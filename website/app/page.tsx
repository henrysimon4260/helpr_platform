import Link from "next/link";
import LegalDisclaimer from "./components/legal-disclaimer";
import ScrollRevealStoreButtons from "./components/scroll-reveal-store-buttons";
import SlowScrollLink from "./components/slow-scroll-link";

const highlights = [
  {
    title: "Book in Under a Minute",
    description:
      "Instant quote matching and one-tap confirmations keep booking fast from the first screen.",
  },
  {
    title: "Transparent Flat Pricing",
    description:
      "Know the cost before checkout with clear rates and no hidden post-service surprises.",
  },
  {
    title: "Trusted Local Pros",
    description:
      "Every pro on Helpr completes verification steps so quality and reliability stay high.",
  },
];

const trustStats = [
  { value: "10%", label: "Lower platform fees for homeowners" },
  { value: "24/7", label: "On-demand booking availability" },
  { value: "4.9", label: "Average service satisfaction target" },
];

export default function Home() {
  return (
    <main className="relative min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:h-20 sm:flex-row sm:items-center sm:justify-between sm:px-6 md:px-10">
          <Link href="/" className="text-3xl font-bold text-[#0e5a2a] sm:text-4xl">
            helpr
          </Link>
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-4 md:gap-8">
            <SlowScrollLink
              href="#download"
              className="text-sm font-bold text-slate-900 sm:text-base"
            >
              Download
            </SlowScrollLink>
            <Link
              href="/become-a-pro"
              className="rounded-lg border border-[#0e5a2a]/35 px-4 py-2 text-sm font-bold text-[#0e5a2a] transition hover:bg-[#0e5a2a]/5 sm:px-5 sm:text-base"
            >
              Become a Pro
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-100 bg-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(75,176,137,0.14),transparent_42%),radial-gradient(circle_at_84%_76%,rgba(96,155,255,0.12),transparent_40%)]" />
        <div className="absolute -left-24 top-14 h-72 w-72 rounded-full bg-[#89d9b2]/20 blur-3xl" />
        <div className="absolute -right-20 bottom-8 h-64 w-64 rounded-full bg-[#92c7ff]/20 blur-3xl" />

        <div className="relative z-10 mx-auto flex min-h-[82vh] w-full max-w-7xl items-center px-6 py-16 md:px-10 md:py-20">
          <div className="grid w-full items-center gap-12 md:grid-cols-[1fr_1.05fr]">
            <div className="mx-auto w-full max-w-sm md:max-w-md">
              <div className="relative rounded-[2.5rem] border border-[#cde7d8] bg-gradient-to-b from-[#f6fffa] to-[#edf7f2] p-3 shadow-[0_28px_64px_rgba(16,55,38,0.12)]">
                <div className="aspect-[9/19] rounded-[2rem] border border-white/90 bg-[linear-gradient(160deg,#f9fffd_0%,#e6f3ec_68%,#dbeee5_100%)] p-5">
                  <div className="flex h-full flex-col justify-between rounded-[1.6rem] border border-[#cee4d8]/80 bg-white/65 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3f6f58]">
                      iPhone Hero Slot
                    </p>
                    <p className="text-sm leading-6 text-[#3b5d4c]">
                      Drop your high-quality iPhone mockup here and this frame is
                      ready to showcase it.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="max-w-2xl">
              <p className="inline-flex rounded-full border border-[#b6d5c5] bg-white/80 px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#1d5f3a]">
                Home Services, Simplified
              </p>
              <h1 className="mt-5 text-5xl font-bold leading-tight text-slate-900 md:text-6xl">
                <span className="text-[#0e5a2a]">Flat rates.</span>
                <br />
                Instant booking.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-[#46604f] md:text-lg">
                Book trusted local professionals quickly with transparent pricing
                and a streamlined experience from start to finish.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <SlowScrollLink
                  href="#download"
                  className="rounded-xl bg-[#0e5a2a] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#0a4a23]"
                >
                  Download the App
                </SlowScrollLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#dce9df] bg-[#f8fcfa]">
        <div className="mx-auto w-full max-w-7xl px-6 py-16 md:px-10 md:py-20">
          <div className="grid gap-5 md:grid-cols-3">
            {highlights.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-[#d7eadd] bg-white/90 p-6 shadow-[0_16px_34px_rgba(15,54,34,0.06)]"
              >
                <h2 className="text-xl font-semibold text-[#153f25]">{item.title}</h2>
                <p className="mt-3 text-sm leading-7 text-[#446050]">
                  {item.description}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-10 grid gap-4 rounded-3xl border border-[#d9e9de] bg-white/90 p-6 text-center md:grid-cols-3 md:p-8">
            {trustStats.map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl font-bold text-[#0e5a2a] md:text-4xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm text-[#476252]">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="download" className="relative overflow-hidden bg-[#103622] text-[#eef6ef]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(138,231,184,0.18),transparent_42%),radial-gradient(circle_at_80%_78%,rgba(84,144,255,0.16),transparent_40%)]" />
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-10 px-6 py-20 text-center md:gap-12 md:px-10 md:py-24">
          <ScrollRevealStoreButtons
            appStoreAriaLabel="Download Helpr on the App Store"
            playStoreAriaLabel="Get Helpr on Google Play"
            threshold={120}
            className="mt-2"
            gapClassName="gap-6 sm:gap-14"
          />
          <div className="flex flex-col items-center gap-2 md:gap-2.5">
            <h2 className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.015em] text-white md:text-5xl">
              Download the Helpr App
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-[#d2e9d7] md:text-base">
              Book trusted pros, manage appointments, and stay on top of every
              service from one clean mobile workflow.
            </p>
          </div>
        </div>
      </section>

      <footer className="bg-[#1f4d2c] text-[#eef5ea]">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 md:px-10">
          <div className="flex flex-col gap-5 text-center sm:text-left md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-2xl font-bold tracking-[-0.01em]">helpr</p>
              <p className="text-sm text-[#d5e6d0]">
                Trusted Home Services Professionals
              </p>
            </div>
            <nav className="grid grid-cols-2 gap-x-5 gap-y-2 text-sm font-medium text-[#e6f0e0] sm:flex sm:flex-wrap sm:items-center">
              <Link href="/">Home</Link>
              <Link href="/become-a-pro">Become a Pro</Link>
              <Link href="/contact-us">Customer Support</Link>
              <a href="#" aria-disabled="true" className="cursor-default opacity-70">
                Terms
              </a>
              <a href="#" aria-disabled="true" className="cursor-default opacity-70">
                Privacy
              </a>
            </nav>
          </div>
          <LegalDisclaimer className="mt-6 border-t border-white/20 pt-4 text-center text-[11px] leading-5 text-[#d5e6d0] [&>p+p]:mt-1" />
        </div>
      </footer>
    </main>
  );
}