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

      <section className="relative h-[133vh] w-full overflow-hidden border-b border-slate-100 bg-white">
        <video
          className="absolute inset-x-0 -top-[6%] h-[106%] w-full object-cover [object-position:10%_50%]"
          autoPlay
          muted
          playsInline
          preload="metadata"
        >
          <source src="/animations/select_helpr_mockup.mp4" type="video/mp4" />
        </video>

        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-[linear-gradient(to_right,transparent_0%,rgba(255,255,255,0.6)_45%,rgba(255,255,255,0.92)_100%)] md:block" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_70%,rgba(255,255,255,0.7)_100%)] md:hidden" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex h-screen items-center pb-24 md:pb-32">
          <div className="pointer-events-auto mx-auto flex w-full max-w-7xl items-center px-6 md:px-10">
            <div className="grid w-full items-center gap-12 md:grid-cols-[1.35fr_0.65fr]">
              <div aria-hidden="true" className="hidden md:block" />
              <div className="ml-auto w-full max-w-xl">
                <p className="inline-flex rounded-full border border-[#b6d5c5] bg-white/85 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1d5f3a] backdrop-blur">
                  Home Services, Simplified
                </p>
                <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-[-0.015em] text-slate-900 md:text-6xl">
                  <span className="block whitespace-nowrap text-[#0e5a2a]">Flat rates.</span>
                  <span className="block whitespace-nowrap">Instant booking.</span>
                </h1>
                <p className="mt-5 max-w-xl text-base leading-[1.7] text-[#3f5848] md:text-lg">
                  Book trusted local professionals quickly with transparent pricing
                  and a streamlined experience from start to finish.
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-4">
                  <SlowScrollLink
                    href="#download"
                    className="rounded-xl bg-[#0e5a2a] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(14,90,42,0.22)] transition hover:-translate-y-0.5 hover:bg-[#0a4a23]"
                  >
                    Download the App
                  </SlowScrollLink>
                </div>
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