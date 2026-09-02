import { ChevronDownIcon } from "./icons";
import { Reveal } from "./reveal";
import { HeroOrbitAnimation } from "./hero-orbit-animation";

export function Hero() {
  return (
    // Mobile top padding trimmed from the original pt-16 (and the mobile
    // animation's my-6 below trimmed to my-4, the CTA row's mt-8 to mt-6)
    // to reclaim the vertical space the new two-line H1 + tagline added —
    // confirmed via a real mobile screenshot that without this, the body
    // paragraph's last line collided with the fixed WhatsApp button
    // (floating-whatsapp.tsx) on first paint, no scrolling needed. Desktop
    // (sm:pt-20 and above) is untouched.
    <header id="top" className="pb-12 pt-10 sm:pt-20">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-12 px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
        <div>
          {/* SEO: H1 leads with the literal product category + market
              ("salon management software" + "Sri Lanka") so search engines
              and skimming visitors both get search-clarity first. The
              former H1 — a strong marketing line — moves down as a
              supporting tagline rather than being dropped; it's still the
              first thing anyone reads under the H1. Staggered entrance —
              headline+tagline together, then subhead copy, then the CTA
              row — the hero's one spend of the "authored moment" motion
              budget. */}
          <Reveal>
            <h1 className="text-[clamp(32px,5vw,48px)] font-bold leading-[1.12]">
              Salon Management Software Built for Sri Lankan Salons
            </h1>
            <p className="mt-3 text-xl font-semibold leading-snug text-[var(--navy)] sm:text-2xl">
              One system. Every booking. No double-bookings — ever.
            </p>
          </Reveal>

          {/* Mobile only: the animation sits right after the headline here,
              not below the copy and CTAs — a second instance of the same
              component, since this is the only way to move it up on mobile
              without touching the desktop grid/spacing below at all (that
              layout was already reviewed and approved). CSS animations
              pause (not reset) while `display:none`, so having two mounted
              instances costs nothing visible — only one is ever painted. */}
          <div className="my-4 md:hidden">
            <HeroOrbitAnimation />
          </div>

          <Reveal className="delay-[120ms]">
            <p className="mt-4 max-w-[54ch] text-lg leading-relaxed text-[var(--slate)]">
              ZelyraOne runs the walk-in, the phone call, the WhatsApp message, and the online booking through the
              same engine — so Colombo&rsquo;s salons, barbers, and wellness studios never lose a chair to a
              scheduling mistake.
            </p>
          </Reveal>
          <Reveal className="delay-[240ms]">
            <div className="mt-6 flex flex-wrap items-center gap-6 sm:mt-8">
              <a
                href="#book-demo"
                className="btn btn-primary px-7 py-3 text-base"
                data-analytics="demo_click"
                data-cta-location="hero"
              >
                Book a 30-minute demo
              </a>
              <a
                href="#comparison"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--slate)] hover:text-[var(--navy)]"
              >
                See how it works
                <ChevronDownIcon />
              </a>
            </div>
          </Reveal>
        </div>

        <Reveal className="hidden md:block">
          <HeroOrbitAnimation />
        </Reveal>
      </div>
    </header>
  );
}
