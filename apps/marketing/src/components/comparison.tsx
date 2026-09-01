import { CheckIcon, CrossIcon } from "./icons";
import { Reveal } from "./reveal";

const OLD_WAY = [
  "Two staff take the same slot by phone and WhatsApp, an hour apart.",
  "A walk-in booking never makes it into the online calendar.",
  "A price dispute has no record of what was actually agreed.",
  "Nobody notices a chair is empty until the day is already over.",
];

const WITH_ZELYRAONE = [
  "One shared calendar — the database refuses a second booking on a taken slot.",
  "Walk-in, phone, WhatsApp, and online all land in the same place, instantly.",
  "Every appointment keeps the exact price and duration it was booked at.",
  "The whole day — check-ins, waiting, revenue — on one screen.",
];

export function Comparison() {
  return (
    <section id="comparison" className="py-16 sm:py-20">
      <div className="mx-auto max-w-[1120px] px-6">
        <Reveal>
          <h2 className="text-[clamp(24px,3.4vw,32px)] font-bold">
            The old way runs on memory. ZelyraOne runs on one engine.
          </h2>
          <p className="mt-3 max-w-[62ch] text-[var(--slate)]">
            Every channel your customers already use — phone, WhatsApp, walk-in, online — writes to the same
            calendar, enforced by the database itself.
          </p>
        </Reveal>

        <Reveal className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-6">
            <h4 className="mb-4">Without ZelyraOne</h4>
            <ul className="flex flex-col gap-3.5">
              {OLD_WAY.map((item) => (
                <li key={item} className="flex gap-2.5 text-[15px] text-[var(--slate)]">
                  {/* Audit finding: --slate-soft is 2.56:1 on white, below WCAG's
                      3:1 non-text threshold — --slate (already this column's
                      body-text color) is 4.76:1. */}
                  <CrossIcon className="mt-0.5 flex-shrink-0 text-[var(--slate)]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[var(--r-md)] bg-[var(--navy)] p-6">
            <h4 className="mb-4 text-white">With ZelyraOne</h4>
            <ul className="flex flex-col gap-3.5">
              {WITH_ZELYRAONE.map((item) => (
                <li key={item} className="flex gap-2.5 text-[15px] text-[#CBD5E1]">
                  <CheckIcon className="mt-0.5 flex-shrink-0 text-[var(--teal)]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
