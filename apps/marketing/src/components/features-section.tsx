"use client";

import { useState, type CSSProperties, type JSX, type KeyboardEvent } from "react";
import { Reveal } from "./reveal";
import {
  CalendarCheckIcon,
  ChartIcon,
  ClipboardCheckIcon,
  CustomerIcon,
  GlobeIcon,
  LaptopIcon,
  LayersIcon,
  LogIcon,
  MailIcon,
  ReceiptIcon,
  RegisterIcon,
  ShieldIcon,
  StockBoxIcon,
} from "./icons";

type IconComponent = (props: { className?: string }) => JSX.Element;

interface FeatureTile {
  eyebrow: string;
  icon: IconComponent;
  title: string;
  body: string;
  /** Set once a real screenshot exists for this tile; a plain icon placeholder renders until then. */
  imageSrc?: string;
}

/**
 * Every claim here is checked against what the admin app actually does —
 * see the plan this was built from. Two corrections from the original
 * draft, both confirmed with the user: no salary/payroll feature exists
 * (attendance + commission payouts do), and the win-back message sends
 * over email, never SMS.
 */
const EXCLUSIVE: FeatureTile[] = [
  {
    eyebrow: "Exclusive",
    icon: CustomerIcon,
    title: "One place for everything about a customer",
    body: "Every visit, what they usually book, how much they've spent, and any notes you've added — all on one screen, the moment they call or walk in.",
    imageSrc: "/feature-svgs/02-customer-profile.svg",
  },
  {
    eyebrow: "Exclusive",
    icon: MailIcon,
    title: "Win back customers who've drifted away",
    body: "See who hasn't booked in a while, write them a message with a discount, and send it in a few clicks — over email.",
    imageSrc: "/feature-svgs/03-win-back-customers.svg",
  },
  {
    eyebrow: "Exclusive",
    icon: RegisterIcon,
    title: "Sell products at checkout, not just book services",
    body: "Ring up shampoo or anything else you stock right at the counter — search it, scan a barcode, or add it on the spot even if it's not in your catalog yet.",
    imageSrc: "/feature-svgs/06-products-at-checkout.svg",
  },
  {
    eyebrow: "Exclusive",
    icon: StockBoxIcon,
    title: "Stock that tracks itself, including expiry",
    body: "Know what's running low, what's about to expire, and what already has — before it becomes a problem you find out about the hard way.",
    imageSrc: "/feature-svgs/04-smart-stock-expiry.svg",
  },
  {
    eyebrow: "Exclusive",
    icon: ChartIcon,
    title: "Reports that actually tell you something",
    body: "Your takings, your best (and slowest) staff, what's selling, your busiest hours, and which customers haven't been back in a while — not just one sales total at the end of the month.",
    imageSrc: "/feature-svgs/01-reports-insights.svg",
  },
];

const EXPECT: FeatureTile[] = [
  {
    eyebrow: "You expect",
    icon: CalendarCheckIcon,
    title: "Customers book you online, day or night",
    body: "No more playing phone tag — they pick a real open slot themselves, any time.",
    imageSrc: "/feature-svgs/10-book-online-anytime.svg",
  },
  {
    eyebrow: "You expect",
    icon: ClipboardCheckIcon,
    title: "Staff attendance and commission payouts, without the books",
    body: "See who's in, who's late, and run each stylist's commission payout — from one screen instead of juggling separate notebooks.",
    imageSrc: "/feature-svgs/07-staff-attendance-commission.svg",
  },
  {
    eyebrow: "You expect",
    icon: ShieldIcon,
    title: "Your data stays private to your salon",
    body: "No other business on ZelyraOne can ever see your customers or your numbers.",
    imageSrc: "/feature-svgs/08-private-salon-data.svg",
  },
  {
    eyebrow: "You expect",
    icon: ReceiptIcon,
    title: "Invoices that send themselves",
    body: "Every sale gets a proper numbered invoice, emailed automatically — and if something needs correcting, the original is always kept, never quietly edited.",
    imageSrc: "/feature-svgs/09-auto-invoices.svg",
  },
];

const BARRIERS: FeatureTile[] = [
  {
    eyebrow: "Removes a barrier",
    icon: LaptopIcon,
    title: "Check on your salon without being there",
    body: "Log in from your phone or any computer to see today's appointments and what's outstanding, and get notified within moments when someone books online.",
    imageSrc: "/feature-svgs/14-remote-salon-check.svg",
  },
  {
    eyebrow: "Removes a barrier",
    icon: GlobeIcon,
    title: "Get online, free",
    body: "Never had a website? You don't need one — customers can find and book your salon on ZelyraOne without you building or paying for anything extra.",
    imageSrc: "/feature-svgs/11-get-online-free.svg",
  },
  {
    eyebrow: "Removes a barrier",
    icon: LayersIcon,
    title: "One system instead of five",
    body: "Booking, payments, staff, stock, reports — stop paying for and switching between separate tools.",
    imageSrc: "/feature-svgs/12-one-system.svg",
  },
  {
    eyebrow: "Removes a barrier",
    icon: LogIcon,
    title: "A record of who did what, and when",
    body: "Every price change, cancellation, and refund is logged automatically, so you always know what happened even when you weren't there to see it.",
    imageSrc: "/feature-svgs/13-audit-history.svg",
  },
];

const TABS = [
  { id: "exclusive", label: "Exclusive features", shortLabel: "Exclusive", tiles: EXCLUSIVE, durationS: 34 },
  { id: "expect", label: "Features you expect", shortLabel: "Expected", tiles: EXPECT, durationS: 28 },
  { id: "barriers", label: "Features removing barriers", shortLabel: "Barriers", tiles: BARRIERS, durationS: 28 },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * `duplicate` marks the second, visually-identical copy of the tile list
 * that exists only so the marquee can loop to exactly -50% with no seam —
 * it's hidden from assistive tech and pulled out of the tab order so a
 * keyboard/screen-reader user never hits the same card and "Learn more"
 * link twice. The first copy stays fully real and reachable.
 */
function Tile({ tile, duplicate = false }: { tile: FeatureTile; duplicate?: boolean }) {
  const Icon = tile.icon;
  return (
    <div className="features-tile" aria-hidden={duplicate || undefined}>
      <div className="features-tile-image">{tile.imageSrc ? <img src={tile.imageSrc} alt="" /> : <Icon />}</div>
      <div className="features-tile-eyebrow">
        <Icon />
        <span>{tile.eyebrow}</span>
      </div>
      <h4>{tile.title}</h4>
      <p>{tile.body}</p>
      <a
        href="#book-demo"
        className="learn-more"
        tabIndex={duplicate ? -1 : undefined}
        data-analytics="demo_click"
        data-cta-location="features_section"
      >
        Learn more
      </a>
    </div>
  );
}

export function FeaturesSection() {
  const [activeTab, setActiveTab] = useState<TabId>("exclusive");

  // Roving-tabindex arrow-key navigation (the ARIA Tabs pattern) — only the
  // active tab sits in the normal Tab order, and Left/Right/Home/End move
  // both focus and selection between the others, matching what a screen
  // reader or keyboard-only user expects from a real tablist, not just a
  // row of buttons that happen to toggle content.
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = TABS[nextIndex];
    setActiveTab(next.id);
    document.getElementById(`features-tab-${next.id}`)?.focus();
  }

  return (
    <section id="features" className="py-16 sm:py-20">
      <Reveal as="section" className="mx-auto max-w-[1120px] px-6">
        <h2 className="text-[clamp(24px,3.4vw,32px)] font-bold">Everything your salon actually needs</h2>
        <p className="mt-3 max-w-[62ch] text-[var(--slate)]">
          Not a demo of everything it could do — the parts that solve a real problem, every day.
        </p>

        <div
          className="mt-8 inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-[var(--border)] p-1"
          role="tablist"
          aria-label="Feature categories"
        >
          {TABS.map((tab, index) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`features-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`features-panel-${tab.id}`}
                aria-label={tab.label}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className={`whitespace-nowrap rounded-full px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4 ${
                  isActive ? "bg-white text-[var(--navy)] shadow-sm" : "text-[var(--slate)] hover:text-[var(--navy)]"
                }`}
              >
                {/* Shortened below `sm` so all three tabs fit on one row without
                    scrolling — a full label like "Features removing barriers"
                    can't fit three-wide on a narrow phone at any readable size.
                    `aria-label` above keeps the full wording for assistive tech
                    regardless of which text is visible. */}
                <span className="sm:hidden" aria-hidden="true">
                  {tab.shortLabel}
                </span>
                <span className="hidden sm:inline" aria-hidden="true">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {TABS.map((tab) => (
          <div
            key={tab.id}
            id={`features-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`features-tab-${tab.id}`}
            hidden={activeTab !== tab.id}
            className="mt-10"
          >
            <div className="features-marquee">
              <div
                className="features-track"
                style={{ "--features-marquee-duration": `${tab.durationS}s` } as CSSProperties}
              >
                {tab.tiles.map((tile) => (
                  <Tile key={`${tab.id}-${tile.title}`} tile={tile} />
                ))}
                {/* Duplicated once so the loop can animate to exactly -50% with no visible
                    seam — hidden from assistive tech and the tab order, see Tile above. */}
                {tab.tiles.map((tile) => (
                  <Tile key={`${tab.id}-${tile.title}-dup`} tile={tile} duplicate />
                ))}
              </div>
            </div>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
