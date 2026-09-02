import { ChevronDownIcon } from "./icons";
import { Reveal } from "./reveal";
import { HeroOrbitAnimation } from "./hero-orbit-animation";

export function Hero() {
  return (
    <header id="top" className="pb-12 pt-16 sm:pt-20">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-12 px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
        <div>
          {/* Staggered entrance — headline, then subhead, then the CTA row —
              the hero's one spend of the "authored moment" motion budget. */}
          <Reveal>
            <h1 className="text-[clamp(32px,5vw,48px)] font-bold leading-[1.12]">
              One system. Every booking. No double-bookings — ever.
            </h1>
          </Reveal>

          {/* Mobile only: the animation sits right after the headline here,
              not below the copy and CTAs — a second instance of the same
              component, since this is the only way to move it up on mobile
              without touching the desktop grid/spacing below at all (that
              layout was already reviewed and approved). CSS animations
              pause (not reset) while `display:none`, so having two mounted
              instances costs nothing visible — only one is ever painted. */}
          <div className="my-6 md:hidden">
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
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <a href="#book-demo" className="btn btn-primary px-7 py-3 text-base">
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
