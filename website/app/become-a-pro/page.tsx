import Link from "next/link";
import Image from "next/image";
import LegalDisclaimer from "../components/legal-disclaimer";
import ScrollRevealStoreButtons from "../components/scroll-reveal-store-buttons";
import SlowScrollLink from "../components/slow-scroll-link";

const signupSteps = [
  {
    number: "1",
    title: "Create Account",
    description:
      "Build your pro profile in minutes with your core contact info, service categories, and preferred work zones. Add a short intro and portfolio photos so customers can quickly trust your listing.",
    circleColor: "bg-[#a58a62]",
  },
  {
    number: "2",
    title: "Background Check",
    description:
      "Submit your verification details once and we will guide you through each checkpoint. This keeps the platform safe, boosts customer confidence, and helps your profile get approved faster.",
    circleColor: "bg-[#6f8452]",
  },
  {
    number: "3",
    title: "Safety Quiz",
    description:
      "Complete a short safety and quality quiz based on real service scenarios. Once you pass, you can request active listings, set your rates, and start earning right away.",
    circleColor: "bg-[#8c7a57]",
  },
];

const proBenefits = [
  {
    title: "Keep More of Every Job",
    description:
      "Competitive platform fees help you protect earnings and scale your business with confidence.",
  },
  {
    title: "Work on Your Terms",
    description:
      "Set your service areas, rates, and availability so your schedule works for your life.",
  },
  {
    title: "Build Long-Term Clients",
    description:
      "Strong repeat booking tools and profile credibility features help you stay fully booked.",
  },
];

export default function BecomeAProPage() {
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
            <SlowScrollLink
              href="#download"
              className="rounded-lg border border-[#0e5a2a]/30 px-4 py-2 text-sm font-semibold text-[#0e5a2a] transition hover:bg-[#0e5a2a]/5"
            >
              Download
            </SlowScrollLink>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#2f5b35]">
        <Image
          src="/images/become_a_pro_bg.png"
          alt=""
          fill
          priority
          aria-hidden="true"
          className="object-cover object-[center_34%] scale-[1.28]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(14,33,20,0.32),rgba(14,33,20,0.60))]" />
        <p className="absolute left-6 top-8 z-10 rounded-full border border-[#eadfcb]/45 bg-[#eadfcb]/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#f4ebd9] md:left-10 md:top-10">
          Get Started Today
        </p>

        <div className="relative mx-auto flex min-h-[78vh] max-w-7xl items-center px-6 py-20 text-center md:px-10 md:py-24">
          <div className="relative mx-auto mt-6 max-w-4xl px-5 py-6 md:px-8 md:py-7">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[2rem] bg-gradient-to-b from-[#1b2b1f]/18 to-[#1b2b1f]/8 backdrop-blur-[1.5px]"
            />
            <h1 className="relative mx-auto max-w-4xl text-5xl font-bold leading-tight text-[#f8f0e2] drop-shadow-[0_2px_10px_rgba(0,0,0,0.28)] md:text-6xl">
              Become a Helpr Services Pro
            </h1>
            <p className="relative mx-auto mt-5 max-w-3xl text-base font-light leading-8 tracking-[0.01em] text-[#efe3cf] drop-shadow-[0_1px_8px_rgba(0,0,0,0.22)] md:text-lg">
              Join our trusted team as a service provider. Start completing
              services as soon as today and earn flat rates. Set your own prices
              and request to fill active listings.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-[#ded0b2] bg-[#f5ebd7]">
        <div className="mx-auto w-full max-w-7xl px-6 py-14 md:px-10 md:py-16">
          <div className="grid gap-5 md:grid-cols-3">
            {proBenefits.map((benefit) => (
              <article
                key={benefit.title}
                className="rounded-2xl border border-[#dfd0b0] bg-[#fff8e9] p-6 shadow-[0_12px_28px_rgba(48,66,39,0.08)]"
              >
                <h2 className="text-xl font-semibold text-[#234128]">
                  {benefit.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-[#40523f]">
                  {benefit.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-6 py-16 md:px-10 md:py-20">
        <h2 className="text-3xl font-semibold text-[#244229] md:text-4xl">
          Get Approved in 3 Steps
        </h2>
        <p className="mt-3 max-w-2xl text-base text-[#4a5c48]">
          Three quick steps to get approved, trusted, and ready to accept your
          first booking request.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {signupSteps.map((step) => (
            <article
              key={step.number}
              className="relative rounded-3xl border border-[#ddcfb2] bg-[#fff8e9] p-6 pt-7 shadow-sm"
            >
              <div
                className={`absolute left-6 top-6 flex h-11 w-11 items-center justify-center rounded-full text-base font-bold text-[#f8f0e2] ${step.circleColor}`}
              >
                {step.number}
              </div>
              <h3 className="pl-16 text-xl font-semibold text-[#234128]">
                {step.title}
              </h3>
              <p className="mt-5 text-sm leading-7 text-[#3d4f3d]">
                {step.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section id="download" className="border-t border-[#ded0b2] bg-[#f2e9d8]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-10 px-6 py-20 md:gap-12 md:px-10 md:py-24">
          <ScrollRevealStoreButtons
            appStoreAriaLabel="Download Helpr Pro on the App Store"
            playStoreAriaLabel="Get Helpr Pro on Google Play"
            threshold={120}
            gapClassName="gap-6 sm:gap-14"
          />
          <div className="flex flex-col items-center gap-2 md:gap-2.5">
            <h2 className="max-w-3xl text-center text-4xl font-semibold leading-tight tracking-[-0.015em] text-[#1f3a24] md:text-5xl">
              Download the Helpr Pro App
            </h2>
            <p className="max-w-xl text-center text-sm leading-7 text-[#4d5f4e] md:text-base">
              Manage requests, stay on schedule, and track earnings in one clean
              workflow.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#d8ccb2] bg-[#f7f1e4]">
        <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-2xl font-bold tracking-[-0.01em] text-[#0e5a2a]">
                helpr
              </p>
              <p className="text-sm text-[#5a6855]">
                Built for professionals who take pride in every service.
              </p>
            </div>
            <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-[#2f4832]">
              <Link href="/">Home</Link>
              <Link href="/become-a-pro">Become a Pro</Link>
              <Link href="/contact-us-for-pros">Customer Support</Link>
              <a href="#" aria-disabled="true" className="cursor-default opacity-70">
                Terms
              </a>
              <a href="#" aria-disabled="true" className="cursor-default opacity-70">
                Privacy
              </a>
            </nav>
          </div>
          <LegalDisclaimer
            className="mt-6 border-t border-[#d8ccb2] pt-4 text-center text-[11px] leading-5 text-[#5a6855] [&>p+p]:mt-1"
            includeProOnboardingNotice
          />
        </div>
      </footer>
    </main>
  );
}
