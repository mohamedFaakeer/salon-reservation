import { CheckIcon, PlayIcon } from "./icons";
import { Reveal } from "./reveal";

export function VideoSection({
  id,
  heading,
  badge,
  features,
  reverse = false,
  tinted = false,
}: {
  id: string;
  heading: string;
  badge: string;
  features: { label: string; body: string }[];
  reverse?: boolean;
  tinted?: boolean;
}) {
  return (
    <section
      id={id}
      className={`py-16 sm:py-20 ${tinted ? "border-y border-[var(--border)] bg-[var(--surface)]" : ""}`}
    >
      <div className="mx-auto max-w-[1120px] px-6">
        <Reveal>
          <h2 className="text-[clamp(24px,3.4vw,32px)] font-bold">{heading}</h2>
        </Reveal>
        <Reveal
          className={`mt-8 grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-12 ${
            reverse ? "md:[&>*:first-child]:order-2" : ""
          }`}
        >
          <div>
            <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[linear-gradient(155deg,#101B34_0%,var(--navy)_55%,#16233F_100%)] shadow-[var(--shadow-md)]">
              <div className="pointer-events-none absolute inset-[18px] rounded-[var(--r-default)] border border-white/[0.08] bg-white/[0.05]">
                <div className="absolute left-4 right-4 top-4 h-2 rounded-full bg-white/10" />
                <div className="absolute bottom-4 left-4 right-[40%] top-10 rounded-[var(--r-sm)] bg-white/[0.06]" />
              </div>
              <div className="group relative z-[2] flex h-[60px] w-[60px] items-center justify-center rounded-full bg-white shadow-[var(--shadow-lg)] transition-transform hover:scale-105">
                <PlayIcon />
              </div>
              <span className="absolute bottom-3.5 left-3.5 z-[2] rounded-[var(--r-sm)] bg-[rgba(2,6,23,0.55)] px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                {badge}
              </span>
            </div>
            <p className="mt-2.5 text-xs text-[var(--slate-soft)]">
              Placeholder — the real walkthrough video drops in here once the file is ready.
            </p>
          </div>

          <ul className="flex flex-col gap-4">
            {features.map((feature) => (
              <li key={feature.label} className="flex gap-3 text-[15px]">
                <CheckIcon className="mt-0.5 flex-shrink-0 text-[var(--teal)]" />
                <span>
                  <strong className="text-[var(--navy)]">{feature.label}</strong>{" "}
                  <span className="text-[var(--slate)]">{feature.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
