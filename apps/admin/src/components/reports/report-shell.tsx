import type { ReactNode } from "react";

/**
 * The pieces every report panel is built from.
 *
 * Twelve identically-weighted cards would be the lazy structure here, so
 * these are deliberately plain: a titled region and a bordered surface. What
 * distinguishes one panel from the next is its content, not its chrome.
 */

export function Panel({
  title,
  note,
  tourId,
  children,
}: {
  title: string;
  /** Sits beside the heading rather than above it — this app has no eyebrows. */
  note?: string;
  /** Anchor for the reportsOverview tour — only a handful of panels carry one. */
  tourId?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0" data-tour-id={tourId}>
      <h2 className="mb-2.5 text-[13px] font-semibold text-slate-900">
        {title}
        {note ? <span className="ml-2 font-normal text-slate-500">{note}</span> : null}
      </h2>
      {children}
    </section>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white ${className}`}>{children}</div>
  );
}

/** One figure in the takings strip. Label above, number below, context under it. */
export function Figure({
  label,
  value,
  detail,
  tone = "plain",
}: {
  label: string;
  value: string;
  detail?: string;
  /** `warn` is for money lost — semantic, kept clear of the teal accent. */
  tone?: "plain" | "warn";
}) {
  return (
    <div className="border-r border-slate-200 px-4 py-3.5 last:border-r-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.07em] text-slate-500">{label}</p>
      <p
        className={`mt-0.5 text-[22px] font-semibold tracking-[-0.02em] tabular ${
          tone === "warn" ? "text-amber-700" : "text-slate-900"
        }`}
      >
        {value}
      </p>
      {detail ? <p className="text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

/**
 * What a panel says when the range holds nothing.
 *
 * Named per panel rather than a shared "No data": a quiet week and a salon
 * that has never rated anybody are different facts, and one sentence for both
 * teaches the reader nothing.
 */
export function Quiet({ children }: { children: ReactNode }) {
  return <p className="px-4 py-5 text-sm text-slate-500">{children}</p>;
}

/**
 * The takeaway under a panel, in the reader's own terms.
 *
 * Only written where the numbers alone would be read wrong — a stylist with
 * few jobs but a full diary, or a top-booked service that earns least.
 */
export function Insight({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-md border border-teal-100 bg-teal-50 px-3 py-2.5 text-[13px] text-teal-900">
      {children}
    </p>
  );
}

/**
 * What a locked panel shows instead of its real numbers. The title and note
 * stay in place — the grid doesn't reflow, and an owner sees exactly which
 * report they're missing, not a gap that looks like a bug.
 */
export function LockedPanel({
  title,
  note,
  teaser,
}: {
  title: string;
  note?: string;
  teaser: string;
}) {
  return (
    <Panel title={title} note={note}>
      <Card>
        <div className="flex flex-col items-center gap-2.5 px-6 py-10 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
              <rect x="3.5" y="7" width="9" height="6.5" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </span>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            Pro feature
          </span>
          <p className="max-w-[220px] text-[13px] leading-relaxed text-slate-500">{teaser}</p>
        </div>
      </Card>
    </Panel>
  );
}

export function Th({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`border-b border-slate-200 bg-slate-50/60 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`border-b border-slate-100 px-4 py-2.5 align-middle last:border-b-0 ${
        align === "right" ? "text-right" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}
