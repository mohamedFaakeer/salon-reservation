import { WhatsAppIcon } from "./icons";

/** Shared with ContactSection's own WhatsApp row so the number lives in one place. */
export const WHATSAPP_URL = "https://api.whatsapp.com/send/?phone=94725630734&text&type=phone_number&app_absent=0";

/**
 * A fixed, always-visible chat channel — plain server component, it's just a
 * link, so no client-side state is needed. Rendered once in page.tsx; fixed
 * positioning means where it sits in the tree doesn't matter.
 */
export function FloatingWhatsapp() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className="fixed bottom-6 right-6 z-50 flex h-[58px] w-[58px] items-center justify-center rounded-full text-white shadow-[0_8px_24px_rgba(37,211,102,0.4)] transition-transform hover:-translate-y-0.5 active:scale-[0.94]"
      style={{ background: "#25D366" }}
      data-analytics="whatsapp_click"
      data-cta-location="floating_button"
    >
      <WhatsAppIcon className="h-7 w-7" />
    </a>
  );
}
