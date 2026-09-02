import { Comparison } from "../components/comparison";
import { ContactSection } from "../components/contact-section";
import { DemoBooking } from "../components/demo-booking";
import { Faq } from "../components/faq";
import { FeaturesSection } from "../components/features-section";
import { FloatingWhatsapp } from "../components/floating-whatsapp";
import { FoundingBanner } from "../components/founding-banner";
import { Hero } from "../components/hero";
import { HowItWorks } from "../components/how-it-works";
import { SiteFooter } from "../components/site-footer";
import { SiteNav } from "../components/site-nav";
import { TrustSection } from "../components/trust-section";
import { VideoSection } from "../components/video-section";
import { WhoCanPartner } from "../components/who-can-partner";

const BUSINESS_STEPS = [
  {
    title: "We set up your services, staff, and hours",
    body: "Done together, live, on the 30-minute demo call — not a form you fill out alone.",
  },
  {
    title: "Every booking lands on one calendar",
    body: "Walk-in, phone, WhatsApp, or online — the moment it happens, not after someone updates a spreadsheet.",
  },
  {
    title: "The database blocks the double-booking",
    body: "Not a rule your staff have to remember — a taken slot simply can't be booked twice, from any channel.",
  },
  {
    title: "You see the whole day on one screen",
    body: "Record payments as they happen, track who's checked in, and know who's in the salon right now.",
  },
];

const CUSTOMER_STEPS = [
  {
    title: "Search your salon, spa, or stylist",
    body: "Find the business you already go to, or discover a new one nearby.",
  },
  {
    title: "Pick a service and a real open slot",
    body: "What you see is exactly what's actually free — nothing shown that's already taken.",
  },
  {
    title: "Confirm — no account, no app download",
    body: "An SMS confirms it and reminds you before your appointment. Most bookings take under 60 seconds.",
  },
];

const BUSINESS_VIDEO_FEATURES = [
  { label: "Today board", body: "every appointment, and who's in the salon right now." },
  { label: "Quick Sale", body: "ring up a walk-in without a prior booking." },
  { label: "Attendance", body: "check staff in and out, catch late arrivals." },
  { label: "Audit log", body: "see who changed a price or cancelled a booking, and when." },
];

const CUSTOMER_VIDEO_FEATURES = [
  { label: "Browse", body: "real salons and stylists near you." },
  { label: "See only slots that are actually open", body: "— nothing shown that's already booked." },
  { label: "Book without an account", body: "— name and phone number, that's it." },
  { label: "Get an SMS", body: "the moment it's confirmed." },
];

const BUSINESS_FAQ = [
  {
    q: "Do we have to give up WhatsApp and phone bookings?",
    a: "No — that's exactly the point. Every channel writes to the same calendar, so you keep booking the way your customers already reach you.",
  },
  {
    q: "What if two staff try to book the same slot at once?",
    a: "One of them will see the slot disappear before the other can confirm. The database enforces it — it isn't a person double-checking a spreadsheet.",
  },
  {
    q: "Can other salons see our data?",
    a: "No. Every salon's data is isolated at the database layer — it isn't a permission setting that could be misconfigured.",
  },
  {
    q: "How do we take payment?",
    a: "Staff record cash, card, or bank transfer as it happens. Online card payment is on our roadmap, not switched on yet — we won't tell you it's live if it isn't.",
  },
  {
    q: "What happens after the Founding 50 window closes?",
    a: "Founding partners keep their founding-partner terms for as long as they stay with us. Everyone who joins after the window starts on standard terms.",
  },
];

const CUSTOMER_FAQ = [
  {
    q: "Do I need to create an account?",
    a: "No. Book with your name and phone number — that's it.",
  },
  {
    q: "Will I get reminded about my appointment?",
    a: "Yes — an SMS confirms your booking right away, and reminds you again before it starts.",
  },
  {
    q: "Can I book through WhatsApp instead?",
    a: "Not yet — it's on our roadmap. For now, book on the site or contact the salon directly, and it still lands on the same calendar.",
  },
  {
    q: "Is my number shared with other businesses?",
    a: "No. Your details go only to the salon you booked with.",
  },
];

export default function LandingPage() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <FoundingBanner />
        <Comparison />
        <FeaturesSection />
        <WhoCanPartner />
        <HowItWorks id="business-how" heading="How a salon actually goes live." steps={BUSINESS_STEPS} />
        <VideoSection
          id="business-demo"
          heading="See the admin app in action."
          badge="Admin app walkthrough"
          videoUrl="https://res.cloudinary.com/s5ivpmmf/video/upload/v1788245364/Reports_view.mp4"
          features={BUSINESS_VIDEO_FEATURES}
          tinted
        />
        <Faq id="business-faq" heading="Questions owners ask before booking the call." items={BUSINESS_FAQ} />
        <TrustSection />
        <HowItWorks
          id="for-customers"
          heading="Booking that takes less time than finding the salon's number."
          steps={CUSTOMER_STEPS}
        />
        <VideoSection
          id="customer-demo"
          heading="See the booking app in action."
          badge="Booking app walkthrough"
          videoUrl="https://res.cloudinary.com/s5ivpmmf/video/upload/v1788245469/openvid-1920x1080.mp4"
          features={CUSTOMER_VIDEO_FEATURES}
          reverse
          tinted
        />
        <Faq id="customers-faq" heading="Questions customers ask before their first booking." items={CUSTOMER_FAQ} />
        <DemoBooking />
        <ContactSection id="contact" />
      </main>
      <SiteFooter />
      <FloatingWhatsapp />
    </>
  );
}
