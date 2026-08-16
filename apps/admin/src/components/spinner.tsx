/**
 * Busy indicator for in-flight actions.
 *
 * Buttons previously signalled work by swapping their label ("Booking…"), which
 * on a slow connection is indistinguishable from a click that never landed.
 * The arc is drawn rather than composed from a border so the stroke weight
 * stays consistent with the rest of the icon set at any size.
 *
 * Decorative for assistive tech: the button's own label already changes to a
 * present-participle ("Booking…"), and submit buttons are disabled while busy,
 * so announcing a second "loading" would be redundant chatter.
 */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`motion-spin shrink-0 ${className}`}
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Button label that grows a spinner while its action is in flight.
 *
 * Wrapping the label (rather than restyling every button) keeps the change to
 * one line per call site and guarantees the spinner is aligned and spaced the
 * same way everywhere. The label text still changes to a present participle,
 * because "what is happening" is worth saying even once motion is present.
 */
export function BusyLabel({
  busy,
  busyText,
  children,
}: {
  busy: boolean;
  busyText: string;
  children: React.ReactNode;
}) {
  if (!busy) {
    return <>{children}</>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Spinner />
      {busyText}
    </span>
  );
}
