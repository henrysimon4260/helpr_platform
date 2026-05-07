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
    title: "Transparent Pricing",
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
];

export default function Home() {
  return (
    <main className="relative min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:h-20 sm:px-6 md:px-10">
          <Link
            href="/"
            className="text-2xl font-bold tracking-tight text-[#0e5a2a] sm:text-4xl"
          >
            helpr
          </Link>
          <div className="flex items-center gap-3 sm:gap-4 md:gap-8">
            <SlowScrollLink
              href="#download"
              className="text-sm font-bold text-slate-900 sm:text-base"
            >
              Download
            </SlowScrollLink>
            <Link
              href="/become-a-pro"
              className="rounded-lg border border-[#0e5a2a]/35 px-3 py-1.5 text-sm font-bold text-[#0e5a2a] transition hover:bg-[#0e5a2a]/5 sm:px-5 sm:py-2 sm:text-base"
            >
              Become a Pro
            </Link>
          </div>
        </div>
      </header>

      {/* Hero: mobile = right-half video crop + compact right-aligned copy; md+ scales up with breakpoints */}
      <section className="relative h-[min(118svh,920px)] w-full overflow-hidden border-b border-slate-100 bg-white md:h-[128vh] lg:h-[130vh] xl:h-[133vh]">
        <video
          className="absolute left-0 top-0 h-full w-[200%] -translate-x-1/2 object-cover object-[56%_50%] md:inset-x-0 md:top-auto md:w-full md:translate-x-0 md:object-cover md:[object-position:38%_50%] md:-top-[3%] md:h-[96%] lg:-top-[4%] lg:h-[101%] xl:-top-[5%] xl:h-[103.5%] 2xl:-top-[6%] 2xl:h-[106%]"
          autoPlay
          muted
          playsInline
          preload="metadata"
        >
          <source src="/animations/select_helpr_mockup.mp4" type="video/mp4" />
        </video>

        <div className="pointer-events-none absolute inset-y-0 right-0 hidden bg-[linear-gradient(to_right,transparent_0%,rgba(255,255,255,0.55)_38%,rgba(255,255,255,0.88)_72%,rgba(255,255,255,0.96)_100%)] md:block md:w-[52%] lg:w-[50%] xl:w-1/2" />

        {/* Mobile: soften edge between clipped video (left) and text (right); desktop hidden */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[58%] bg-[linear-gradient(to_right,transparent_0%,rgba(255,255,255,0.35)_35%,rgba(255,255,255,0.82)_72%,rgba(255,255,255,0.97)_100%)] md:hidden" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex h-full items-center pb-16 pt-28 md:items-center md:pb-28 md:pt-24 lg:pb-[7.25rem] xl:pb-32">
          <div className="pointer-events-auto mx-auto flex w-full max-w-7xl justify-end px-3 sm:px-5 md:justify-start md:px-8 lg:px-10">
            <div className="grid w-full items-center md:grid-cols-[1.35fr_0.65fr] md:gap-10 lg:gap-12 xl:gap-14">
              <div aria-hidden="true" className="hidden md:block" />
              <div className="ml-auto w-[min(92%,228px)] sm:w-[min(88%,248px)] md:ml-auto md:w-full md:max-w-xl lg:max-w-2xl">
                <p className="inline-flex rounded-full border border-[#b6d5c5] bg-white/90 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#1d5f3a] backdrop-blur-sm md:bg-white/85 md:px-2.5 md:py-1 md:text-[10px] md:tracking-[0.18em] lg:text-[10.5px] lg:tracking-[0.2em] xl:text-[11px] xl:tracking-[0.22em]">
                  Home Services, On Demand
                </p>
                <h1 className="mt-2 text-[1.0625rem] font-bold leading-[1.06] tracking-[-0.02em] text-slate-900 md:mt-4 md:text-4xl md:leading-[1.06] lg:mt-6 lg:text-5xl xl:text-6xl xl:leading-[1.05] 2xl:text-[3.375rem]">
                  <span className="block text-[#0e5a2a] lg:whitespace-nowrap">Flat rates.</span>
                  <span className="block lg:whitespace-nowrap">Book instantly.</span>
                </h1>
                <p className="mt-2 text-[10px] leading-[1.4] text-[#3f5848] md:mt-4 md:max-w-xl md:text-sm md:leading-[1.6] lg:mt-5 lg:text-base xl:text-lg xl:leading-[1.68]">
                  Moving and Cleaning, Furniture assembly and more. <br/> 
                  Book vetted pros in one tap with upfront pricing.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-7 lg:mt-9 md:gap-4">
                  <SlowScrollLink
                    href="#download"
                    className="inline-flex items-center justify-center rounded-md bg-[#0e5a2a] px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-[0_4px_12px_rgba(14,90,42,0.22)] transition hover:-translate-y-0.5 hover:bg-[#0a4a23] md:rounded-xl md:px-6 md:py-3 md:text-sm md:shadow-[0_10px_24px_rgba(14,90,42,0.22)]"
                  >
                    Get the App
                  </SlowScrollLink>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-[#dce9df] bg-[#f8fcfa]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_8%,rgba(14,90,42,0.06),transparent_55%),radial-gradient(circle_at_0%_100%,rgba(138,231,184,0.14),transparent_55%)]"
        />

        <div className="relative mx-auto w-full max-w-7xl px-6 py-16 sm:py-20 md:px-10 md:py-28">
          <div className="flex flex-col items-start gap-5 md:flex-row md:items-end md:justify-between md:gap-12">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#b6d5c5] bg-white/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#1d5f3a] sm:text-[11px]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#0e5a2a]" />
                Why Helpr
              </span>
              <h2 className="mt-4 text-3xl font-semibold leading-[1.1] tracking-[-0.015em] text-[#153f25] sm:text-4xl md:text-[2.6rem]">
                Built for effortless home services
              </h2>
            </div>
            <p className="max-w-md text-sm leading-7 text-[#446050] md:text-base md:leading-8">
              Everything you need to book, track, and complete home projects in
              one streamlined experience.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:mt-14 md:grid-cols-3 md:gap-6">
            {highlights.map((item, idx) => (
              <article
                key={item.title}
                className="group relative overflow-hidden rounded-2xl border border-[#d7eadd] bg-white p-6 shadow-[0_16px_34px_rgba(15,54,34,0.06)] transition duration-300 hover:-translate-y-1 hover:border-[#b6d5c5] hover:shadow-[0_24px_48px_rgba(15,54,34,0.1)] md:p-7"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0e5a2a] via-[#8ae7b8] to-[#0e5a2a] opacity-80 transition group-hover:opacity-100"
                />
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#eaf5ee] text-[13px] font-bold tracking-[0.02em] text-[#0e5a2a]">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-px flex-1 bg-gradient-to-r from-[#d7eadd] to-transparent"
                  />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-[#153f25] md:text-xl">
                  {item.title}
                </h3>
                <p className="mt-2.5 text-sm leading-7 text-[#446050]">
                  {item.description}
                </p>
              </article>
            ))}
          </div>

          <div className="relative mt-10 overflow-hidden rounded-3xl bg-gradient-to-br from-[#0e5a2a] via-[#0d4e24] to-[#0a3d1c] text-white shadow-[0_24px_48px_rgba(14,90,42,0.18)] md:mt-14">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(138,231,184,0.22),transparent_50%),radial-gradient(circle_at_90%_85%,rgba(84,144,255,0.16),transparent_50%)]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"
            />
            <div className="relative grid divide-y divide-white/10 md:grid-cols-2 md:divide-x md:divide-y-0">
              {trustStats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex flex-col items-center gap-1.5 px-6 py-9 text-center md:gap-2 md:py-12"
                >
                  <p className="text-4xl font-bold tracking-[-0.02em] text-white md:text-5xl">
                    {stat.value}
                  </p>
                  <p className="max-w-xs text-sm text-[#cfe4d3] md:text-[15px]">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="download"
        className="relative overflow-hidden bg-[#0b2e1c] text-[#eef6ef]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(138,231,184,0.22),transparent_48%),radial-gradient(circle_at_82%_82%,rgba(84,144,255,0.18),transparent_45%)]" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[55rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(138,231,184,0.2),transparent_60%)] blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:44px_44px]"
        />

        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-8 px-6 py-20 text-center sm:gap-10 md:px-10 md:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#b9e6c6] backdrop-blur sm:px-4 sm:py-1.5 sm:text-[11px] sm:tracking-[0.24em]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8ae7b8] opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#8ae7b8]" />
            </span>
            Available on iOS &amp; Android
          </span>

          <div className="flex flex-col items-center gap-4 md:gap-5">
            <h2 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.02em] text-white md:text-6xl">
              Download the <span className="text-[#8ae7b8]">Helpr</span> app
            </h2>
            <p className="max-w-xl text-sm leading-7 text-[#cfe4d3] md:text-base md:leading-8">
              Book vetted pros, track every appointment, and manage your home
              services from one streamlined app.
            </p>
          </div>

          <ScrollRevealStoreButtons
            appStoreAriaLabel="Download Helpr on the App Store"
            playStoreAriaLabel="Get Helpr on Google Play"
            threshold={120}
            className="mt-1"
            gapClassName="gap-6 sm:gap-14"
          />

          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[11px] text-[#a6c5ae] sm:text-xs">
            <span className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[#8ae7b8]" />
              Free to download
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[#8ae7b8]" />
              No hidden fees
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[#8ae7b8]" />
              Vetted local pros
            </span>
          </div>
        </div>
      </section>

      <footer className="bg-[#1f4d2c] text-[#eef5ea]">
        <div className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-6 sm:py-8 md:px-10">
          <div className="flex flex-col gap-6 text-center sm:gap-5 sm:text-left md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col items-center gap-0.5 sm:items-start">
              <p className="text-2xl font-bold tracking-[-0.01em]">helpr</p>
              <p className="text-sm text-[#d5e6d0]">
                Trusted Home Services Professionals
              </p>
            </div>
            <nav className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm font-medium text-[#e6f0e0] sm:flex sm:flex-wrap sm:items-center sm:gap-y-2">
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