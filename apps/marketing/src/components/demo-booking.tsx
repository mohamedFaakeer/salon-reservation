"use client";

import { useEffect } from "react";
import { trackEvent } from "../lib/analytics";
import { Reveal } from "./reveal";

/**
 * The page's actual conversion mechanism (PRODUCT.md: "every merchant-facing
 * CTA routes to a real, bookable demo call"). Reads a real env var rather
 * than embedding a placeholder link, so this section is either genuinely
 * live or honestly says it isn't — never a fake widget pretending to work.
 *
 * Provider: Calendly (switched from the originally-planned Cal.com when the
 * user set up their own Calendly link instead — both are free, hosted
 * scheduling providers; this embeds Calendly's plain iframe rather than
 * Cal.com's `?embed=true` pattern). Set NEXT_PUBLIC_CALENDLY_LINK to the
 * part of the URL after "calendly.com/" (e.g. "faakeermohamed/30min" — the
 * real demo length, confirmed with the user; every visible CTA says the same).
 *
 * "use client" only because demo_booked (SEO brief Task 17) needs it: a
 * booked-call confirmation is a real, reliable signal Calendly's iframe
 * embed posts to the parent window (`calendly.event_scheduled`) — not a
 * guess, and not faked the way the brief explicitly warns against.
 */
const CALENDLY_LINK = process.env.NEXT_PUBLIC_CALENDLY_LINK;

export function DemoBooking() {
  useEffect(() => {
    if (!CALENDLY_LINK) return;
    function handleMessage(e: MessageEvent) {
      if (e.origin !== "https://calendly.com") return;
      if (e.data?.event === "calendly.event_scheduled") {
        trackEvent({ name: "demo_booked" });
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <section id="book-demo" className="border-t border-[var(--border)] bg-[var(--surface)] py-16 sm:py-20">
      <Reveal as="section" className="mx-auto max-w-[1120px] px-6">
        <h2 className="text-[clamp(24px,3.4vw,32px)] font-bold">Book your 30-minute demo.</h2>
        <p className="mt-3 max-w-[62ch] text-[var(--slate)]">
          We&rsquo;ll set up your first services and staff live on the call — founding-partner terms included while
          the window&rsquo;s open.
        </p>

        {CALENDLY_LINK ? (
          <div className="mt-8 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] shadow-[var(--shadow-lg)]">
            <iframe
              src={`https://calendly.com/${CALENDLY_LINK}?hide_gdpr_banner=1`}
              title="Book a demo with ZelyraOne"
              className="h-[720px] w-full"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="mt-8 rounded-[var(--r-lg)] border border-dashed border-[var(--border)] bg-[var(--bg)] p-8 text-center">
            <h4>Demo scheduling isn&rsquo;t connected yet</h4>
            <p className="mx-auto mt-1.5 max-w-[48ch] text-[var(--slate)]">
              Set <code className="rounded-[var(--r-sm)] bg-[var(--surface)] px-1.5 py-0.5">NEXT_PUBLIC_CALENDLY_LINK</code>{" "}
              to your Calendly event slug (e.g. <code className="rounded-[var(--r-sm)] bg-[var(--surface)] px-1.5 py-0.5">faakeermohamed/30min</code>) to go live.
            </p>
          </div>
        )}
      </Reveal>
    </section>
  );
}
