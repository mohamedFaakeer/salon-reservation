import { statusStyle } from "../lib/format";

/**
 * The one status chip. Every surface that shows appointment status renders
 * this, so the accessible colour pairing in `statusStyle` cannot drift back
 * into per-component inline styles.
 */
export function StatusBadge({
  status,
  testId,
  tourId,
}: {
  status: string;
  testId?: string;
  tourId?: string;
}) {
  const style = statusStyle(status);
  return (
    <span
      data-testid={testId}
      data-tour-id={tourId}
      className="inline-block rounded px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: style.fill, color: style.fg }}
    >
      {style.label}
    </span>
  );
}
