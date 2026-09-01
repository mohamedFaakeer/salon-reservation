import { Reveal } from "./reveal";

export function Faq({
  id,
  heading,
  items,
}: {
  id: string;
  heading: string;
  items: { q: string; a: string }[];
}) {
  return (
    <section id={id} className="py-16 sm:py-20">
      <Reveal as="section" className="mx-auto max-w-[1120px] px-6">
        <h2 className="text-[clamp(24px,3.4vw,32px)] font-bold">{heading}</h2>
        <div className="mt-8 border-t border-[var(--border)]">
          {items.map((item) => (
            <details key={item.q} className="faq-item border-b border-[var(--border)]">
              <summary className="flex cursor-pointer items-center justify-between gap-6 py-5 font-[var(--font-display)] text-base font-semibold">
                {item.q}
                <span className="plus" />
              </summary>
              <p className="max-w-[66ch] pb-5 text-[var(--slate)]">{item.a}</p>
            </details>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
