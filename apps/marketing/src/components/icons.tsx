/**
 * A small, consistent icon set — one stroke weight, authored as inline SVG.
 * Deliberately not an icon library dependency: this page needs six marks.
 */

export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <path d="M4 9.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CrossIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className} aria-hidden="true">
      <path d="M3 5.5 7 9.5 11 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlayIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M6 4.5v11l9-5.5-9-5.5z" fill="var(--navy)" />
    </svg>
  );
}

export function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="7.5" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 7.5V5.5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function LockClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 5.5v4l2.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ReceiptIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <path d="M4 9h10M4 5h10M4 13h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function LogIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <path d="M9 3v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function PhoneIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 3.5h2.6l1 3.2-1.6 1.3a9 9 0 0 0 3.9 3.9l1.3-1.6 3.2 1v2.6c0 .6-.5 1.1-1.1 1.1C7.9 15 3 10.1 3 4.6c0-.6.5-1.1 1.1-1.1z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* WhatsApp is a recognizable brand mark, not a generic UI glyph, so — like
   PlayIcon above — it's filled rather than drawn in this file's usual single
   stroke weight; a stroke-only outline wouldn't read as "WhatsApp" to anyone. */
export function WhatsAppIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.02 3C9.4 3 4 8.4 4 15.02c0 2.5.8 4.83 2.16 6.75L4.6 27.5l5.9-1.55A11.9 11.9 0 0 0 16.02 27c6.6 0 12-5.4 12-11.98C28.02 8.4 22.62 3 16.02 3zm0 21.6c-2 0-3.9-.55-5.5-1.5l-.4-.24-3.5.92.94-3.4-.26-.42a9.55 9.55 0 0 1-1.5-5.14c0-5.3 4.3-9.6 9.6-9.6s9.6 4.3 9.6 9.6c0 5.3-4.3 9.78-8.98 9.78zm5.3-7.2c-.28-.14-1.66-.82-1.92-.9-.26-.1-.44-.14-.63.14-.18.28-.72.9-.88 1.08-.16.18-.32.2-.6.07-.28-.14-1.18-.44-2.24-1.4-.83-.74-1.38-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.32.42-.48.14-.16.18-.28.28-.46.1-.18.05-.34-.02-.48-.07-.14-.63-1.53-.87-2.1-.23-.55-.46-.48-.63-.48h-.54c-.18 0-.48.07-.73.34-.25.28-.96.94-.96 2.3s.98 2.67 1.12 2.86c.14.18 1.93 2.95 4.68 4.14.65.28 1.16.45 1.56.58.66.2 1.25.18 1.72.11.53-.08 1.66-.68 1.9-1.33.23-.66.23-1.22.16-1.34-.07-.12-.25-.19-.53-.33z" />
    </svg>
  );
}
