import { Reveal } from "./reveal";

const CATEGORIES = ["Hair Salons", "Barbershops", "Med-Spas", "Wellness Studios", "Beauty Retailers"];

export function WhoCanPartner() {
  return (
    <section id="for-partners" className="border-y border-[var(--border)] bg-[var(--surface)] py-16 sm:py-20">
      <Reveal as="section" className="mx-auto max-w-[1120px] px-6">
        <h2 className="text-[clamp(24px,3.4vw,32px)] font-bold">Built for anyone who runs appointments.</h2>
        <p className="mt-3 max-w-[62ch] text-[var(--slate)]">
          If your day is built around a chair, a table, or a time slot, one shared calendar changes how you run it.
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          {CATEGORIES.map((category) => (
            <span key={category} className="chip">
              {category}
            </span>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
