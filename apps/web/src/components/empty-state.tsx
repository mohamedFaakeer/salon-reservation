/**
 * Ground-agnostic by construction.
 *
 * This renders on both the dyed ground and the undyed cloth, so it takes its
 * colours from `currentColor` rather than naming one. Hard-coding either
 * palette here is how the same component ends up washed out on one of them.
 */
export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-dashed border-current/25 px-6 py-9 text-center">
      <p className="text-[14px] font-semibold text-current">{title}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="min-h-12 cursor-pointer rounded-full border-[1.5px] border-current/40 px-5 text-sm font-bold text-current transition-colors duration-[var(--t-tap)] hover:border-current"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
