import { Reveal } from "./reveal";

export function FoundingBanner() {
  return (
    <section className="border-y border-[var(--teal-tint-strong)] bg-[var(--teal-tint)]">
      <Reveal
        as="section"
        className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-6 px-6 py-8"
      >
        <div className="max-w-[56ch]">
          <h3 className="text-xl font-semibold">The Founding 50</h3>
          <p className="mt-1 text-[var(--slate)]">
            We&rsquo;re onboarding the first 50 wellness businesses in Colombo over a two-week window. Founding
            partners lock in founding-partner terms before general pricing opens — no card required to talk.
          </p>
        </div>
        <a href="#book-demo" className="btn btn-navy px-5 py-2.5 text-sm">
          Claim a founding spot
        </a>
      </Reveal>
    </section>
  );
}
