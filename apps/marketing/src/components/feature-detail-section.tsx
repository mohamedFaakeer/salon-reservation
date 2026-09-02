import { Reveal } from "./reveal";

/**
 * One deep-dive section on /features — modeled on HowItWorks' numbered
 * badge and TrustSection's icon-row layout, since this codebase already
 * has both of those conventions rather than inventing a third. Alternating
 * `alt` background (surface vs. bg) is the same technique VideoSection's
 * `tinted` prop uses to separate sections without adding a border on every
 * one.
 */
export function FeatureDetailSection({
  id,
  index,
  eyebrow,
  heading,
  paragraphs,
  pills,
  alt = false,
}: {
  id: string;
  index: number;
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  pills?: string[];
  alt?: boolean;
}) {
  return (
    <section id={id} className={`border-t border-[var(--border)] py-14 sm:py-16 ${alt ? "bg-[var(--surface)]" : ""}`}>
      <Reveal as="section" className="mx-auto grid max-w-[1120px] grid-cols-1 gap-8 px-6 md:grid-cols-[0.85fr_1.15fr] md:gap-14">
        <div>
          <div className="mb-3.5 flex items-center gap-2.5">
            <span className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full bg-[var(--teal-tint)] text-xs font-extrabold text-[var(--teal-dark)]">
              {index}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--teal-dark)]">{eyebrow}</span>
          </div>
          <h2 className="max-w-[20ch] text-[clamp(22px,2.6vw,28px)] font-bold leading-[1.2]">{heading}</h2>
        </div>
        <div className="flex flex-col gap-4">
          {paragraphs.map((p) => (
            <p key={p.slice(0, 40)} className="max-w-[66ch] text-[16px] leading-relaxed text-[var(--slate)]">
              {p}
            </p>
          ))}
          {pills && (
            <div className="mt-1 flex flex-wrap gap-2.5">
              {pills.map((pill) => (
                <span
                  key={pill}
                  className="rounded-full border border-[var(--teal-tint-strong)] bg-[var(--teal-tint)] px-3.5 py-2 text-[13.5px] font-bold text-[var(--teal-dark)]"
                >
                  {pill}
                </span>
              ))}
            </div>
          )}
        </div>
      </Reveal>
    </section>
  );
}
