import type { ReactNode } from "react";

/**
 * Dense table shell for admin lists (UX.md §4.3).
 *
 * Row actions reveal on hover with a pointer and stay visible on touch, where
 * there is no hover to reveal them — `@media (hover: hover)` is the honest
 * test for that, not a viewport width, since a small laptop has a pointer and
 * a large tablet does not.
 *
 * Wraps in its own horizontal scroller so a wide table never makes the whole
 * page scroll sideways.
 */
export function DataTable({
  columns,
  children,
  caption,
}: {
  columns: Array<{ label: string; align?: "left" | "right"; srOnly?: boolean }>;
  children: ReactNode;
  caption?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {columns.map((col, i) => (
              <th
                key={i}
                scope="col"
                className={`whitespace-nowrap px-3 py-2 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500 ${
                  col.align === "right" ? "text-right" : ""
                }`}
              >
                {col.srOnly ? <span className="sr-only">{col.label}</span> : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({
  children,
  muted = false,
  testId,
}: {
  children: ReactNode;
  muted?: boolean;
  testId?: string;
}) {
  return (
    <tr
      data-testid={testId}
      className={`group border-b border-slate-100 last:border-b-0 ${
        muted ? "bg-slate-50/60" : "hover:bg-slate-50"
      }`}
    >
      {children}
    </tr>
  );
}

export function Cell({
  children,
  align = "left",
  className = "",
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2.5 align-middle ${align === "right" ? "text-right tabular" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

/** Right-aligned action cluster: dimmed until row hover on pointer devices. */
export function RowActions({ children }: { children: ReactNode }) {
  return (
    <td className="px-3 py-2.5 text-right">
      <div className="flex justify-end gap-1.5 [@media(hover:hover)]:opacity-30 [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
        {children}
      </div>
    </td>
  );
}
