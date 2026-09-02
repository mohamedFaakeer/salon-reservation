import type { Metadata } from "next";
import { FeatureDetailSection } from "../../components/feature-detail-section";
import { FloatingWhatsapp } from "../../components/floating-whatsapp";
import { Reveal } from "../../components/reveal";
import { SiteFooter } from "../../components/site-footer";
import { SiteNav } from "../../components/site-nav";
import { SITE_URL } from "../../lib/site-config";

const TITLE = "Salon Management Software Features | ZelyraOne";
const DESCRIPTION =
  "Every feature of ZelyraOne's salon management system, explained: appointment booking with no double-bookings, customer management, staff attendance and commissions, POS, payments, and reports.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: "/features",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/features`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

/**
 * Deliberately more detailed than the homepage's own Features section (13
 * tiles, one line each) — this page exists to go deep on the SEO brief's
 * secondary keywords, not to repeat the homepage. Grouped into 7 real
 * capability areas rather than one section per literal keyword phrase, so
 * it reads as genuine product depth, not a keyword list. Every claim here
 * traces to real, verified functionality — nothing invented for this page.
 */
const SECTIONS: {
  id: string;
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  pills?: string[];
}[] = [
  {
    id: "appointments",
    eyebrow: "Appointment & booking system",
    heading: "One Calendar Your Staff Can't Double-Book",
    paragraphs: [
      "Every appointment — booked online, by phone, over WhatsApp, or walked in off the street — goes through the same booking engine and lands on the same calendar. There's no separate online-booking system that has to be kept in sync with what the front desk is doing; there's one system, and every channel writes to it.",
      "This is what a real salon booking system should do but most don't: double-booking isn't prevented by a rule staff have to remember, it's enforced by the database itself. A taken slot for a given staff member simply can't be booked a second time, from any channel, at the same moment.",
      "Rescheduling and cancellation follow whatever policy you set for your salon, rather than a one-size-fits-all rule baked into the software. And a hold on a slot — while a customer's payment is processing, say — releases automatically if it isn't completed, so a slow connection never quietly locks up a chair.",
    ],
  },
  {
    id: "customers",
    eyebrow: "Customer management",
    heading: "Every Customer's History, On One Screen",
    paragraphs: [
      "Pull up a customer and see their full visit history, what they usually book, how much they've spent with you, and any notes your staff has left — no more relying on which stylist happens to remember a regular's preferences.",
      "Customers are automatically grouped into segments so you can see who's actually coming back and who's drifted away, without pulling a report by hand. When someone hasn't booked in a while, you can send them a message with a discount or an offer directly from their profile, over email, in a few clicks.",
    ],
  },
  {
    id: "staff",
    eyebrow: "Staff, attendance & commissions",
    heading: "Know Who's In, Who's Late, and What Everyone's Earned",
    paragraphs: [
      "Every stylist has a profile with the services they're qualified for, their schedule, and their approved leave — so the booking engine only ever offers a slot when someone who can actually do that service is genuinely free.",
      "A daily attendance board shows who's checked in, who's running late, and who's out, with a date-range report when you need to look back over a week or a month. Reassigning a booking to a different stylist mid-day is a drag-and-drop, not a phone call.",
      "Commission isn't tracked on a separate spreadsheet. Set a commission plan per stylist, and the system calculates what they've earned as they work, then preview and finalize a real payout run whenever you're ready to pay it out. This covers commission and attendance — there's no payroll or tax-filing module.",
    ],
  },
  {
    id: "pos",
    eyebrow: "Point of sale & product sales",
    heading: "Ring Up a Walk-In Without Breaking Your Flow",
    paragraphs: [
      "Quick Sale is a real point-of-sale screen for anything you sell at the counter — a service, a retail product, or both in the same transaction. Search by name, scan a barcode, or filter by category and brand to find what you're looking for fast, even on a busy Saturday.",
      "Selling something that isn't in your catalog yet doesn't mean stopping to add it first — ring it up as a custom line now, and turn it into a real catalog product later, whenever a manager gets to it, with no impact on today's sale.",
      "Stock levels update as you sell, and products with expiry dates — color, retail skincare, anything with a shelf life — get flagged before they expire, not after you've already written off a box of stock you forgot about.",
    ],
  },
  {
    id: "payments",
    eyebrow: "Payments & invoicing",
    heading: "A Real Record of Every Payment You Take",
    paragraphs: [
      "Record cash, card, or bank transfer as it happens — the same payment flow whether it's a service booking or a product sale. Every payment is logged with a unique reference, so a retried or duplicated request never creates a second charge.",
      "Every sale generates a proper, numbered invoice automatically, and emails it — no manually typing one up at the end of the day. If a correction is ever needed, the original invoice is never quietly edited; a correction is a new, linked record, so there's always a real trail of what actually happened.",
    ],
  },
  {
    id: "reports",
    eyebrow: "Reports",
    heading: "Reports That Actually Answer a Question",
    paragraphs: [
      "Instead of one sales total at the end of the month, ZelyraOne gives you specific answers: what you took in today versus last week, which stylist is bringing in the most revenue, which services are your slowest movers, your busiest hours so you can staff for them, which customers haven't booked in a while, how much a customer has spent with you over time, where people are dropping off before finishing a booking, and what's actually selling at the counter.",
      "Attendance has its own report too — a date-range view of who was in, who was late, and how often — separate from the daily board you check throughout the day.",
    ],
  },
  {
    id: "who",
    eyebrow: "Who it's for",
    heading: "One System, Whatever Kind of Salon You Run",
    paragraphs: [
      "ZelyraOne runs the same way whether you're a unisex hair salon, a barber shop, a beauty salon offering skin and nail services, or a spa built around longer treatment appointments. The booking engine, staff scheduling, POS, and reports don't change based on what kind of business you are — services, durations, staff qualifications, and product catalog are all yours to configure.",
      "If you're currently running your salon on a paper appointment book, a WhatsApp group, and a notebook for stock, this replaces all three with one system, without asking you to change how your customers already reach you.",
    ],
    pills: ["Beauty salons", "Unisex salons", "Barber shops", "Spas"],
  },
];

const JUMP_LINKS = [
  { id: "appointments", label: "Appointments & booking" },
  { id: "customers", label: "Customers" },
  { id: "staff", label: "Staff & commissions" },
  { id: "pos", label: "POS & sales" },
  { id: "payments", label: "Payments" },
  { id: "reports", label: "Reports" },
  { id: "who", label: "Who it's for" },
];

export default function FeaturesPage() {
  return (
    <>
      <SiteNav />
      <main>
        <header className="pb-8 pt-16 sm:pt-20">
          <Reveal as="section" className="mx-auto max-w-[1120px] px-6">
            <span className="mb-5 inline-block rounded-full bg-[var(--teal-tint)] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[var(--teal-dark)]">
              Salon management software &middot; Sri Lanka
            </span>
            <h1 className="max-w-[22ch] text-[clamp(32px,4.6vw,46px)] font-bold leading-[1.14]">
              Everything Inside ZelyraOne&rsquo;s Salon Management System
            </h1>
            <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-[var(--slate)]">
              One system for appointments, customers, staff, point-of-sale, payments, and reports — built for
              beauty salons, unisex salons, barber shops, and spas across Sri Lanka.
            </p>
            <nav aria-label="Jump to section" className="mt-8 flex flex-wrap gap-2">
              {JUMP_LINKS.map((link) => (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-[13.5px] font-semibold text-[var(--navy)] hover:border-[var(--teal)] hover:text-[var(--teal-dark)]"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </Reveal>
        </header>

        {SECTIONS.map((section, index) => (
          <FeatureDetailSection
            key={section.id}
            id={section.id}
            index={index + 1}
            eyebrow={section.eyebrow}
            heading={section.heading}
            paragraphs={section.paragraphs}
            pills={section.pills}
            alt={index % 2 === 1}
          />
        ))}

        <section className="border-t border-[var(--border)] py-16 text-center sm:py-20">
          <Reveal as="section" className="mx-auto max-w-[640px] px-6">
            <h2 className="text-[clamp(24px,3vw,32px)] font-bold">See it running on your own services and staff.</h2>
            <p className="mt-3 text-[var(--slate)]">We&rsquo;ll set up your first services and staff live on the call.</p>
            <a
              href="/#book-demo"
              className="btn btn-primary mt-6 inline-flex px-7 py-3 text-base"
              data-analytics="demo_click"
              data-cta-location="features_page"
            >
              Book a 30-minute demo
            </a>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
      <FloatingWhatsapp />
    </>
  );
}
