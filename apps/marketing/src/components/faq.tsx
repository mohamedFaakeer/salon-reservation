"use client";

import { useState } from "react";
import { Reveal } from "./reveal";

/**
 * Converted from native <details>/<summary> to a controlled accordion so
 * the expand/collapse can actually animate (audit finding: <details> can't
 * reliably animate open/close height across current browser engines
 * without fighting the UA's own instant display toggle). This is the ARIA
 * Accordion Pattern, not a downgrade — <button aria-expanded> plus
 * <div role="region" aria-labelledby> gives back exactly what <details>
 * provided for free, done deliberately: a screen reader still announces
 * expanded/collapsed state, and Tab/Enter/Space work exactly as before.
 */
export function Faq({
  id,
  heading,
  items,
}: {
  id: string;
  heading: string;
  items: { q: string; a: string }[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id={id} className="py-16 sm:py-20">
      <Reveal as="section" className="mx-auto max-w-[1120px] px-6">
        <h2 className="text-[clamp(24px,3.4vw,32px)] font-bold">{heading}</h2>
        <div className="mt-8 border-t border-[var(--border)]">
          {items.map((item, i) => {
            const isOpen = openIndex === i;
            const buttonId = `${id}-faq-button-${i}`;
            const panelId = `${id}-faq-panel-${i}`;
            return (
              <div key={item.q} className={`faq-item border-b border-[var(--border)] ${isOpen ? "faq-item-open" : ""}`}>
                <button
                  type="button"
                  id={buttonId}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full cursor-pointer items-center justify-between gap-6 py-5 text-left font-[var(--font-display)] text-base font-semibold"
                >
                  {item.q}
                  <span className="plus" />
                </button>
                <div id={panelId} role="region" aria-labelledby={buttonId} className={`faq-panel ${isOpen ? "faq-panel-open" : ""}`}>
                  <div>
                    <p className="max-w-[66ch] pb-5 text-[var(--slate)]">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}
