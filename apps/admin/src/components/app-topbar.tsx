"use client";

/**
 * Mobile/tablet header bar (<lg only).
 *
 * Below `lg` the sidebar becomes an off-canvas drawer (see AppSidebar), so
 * something has to (a) keep the salon's identity visible while it's closed
 * and (b) offer a way to open it. One sticky bar, one button doing both
 * open and close — a separate in-drawer close control would just be a second
 * way to do the same thing.
 */
export function AppTopbar({
  salonName,
  logoUrl,
  open,
  onToggle,
}: {
  salonName: string | null;
  logoUrl?: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-slate-200 bg-white px-4 py-2.5 lg:hidden">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white p-0.5">
        <img src={logoUrl ?? "/branding/zelyra-logo.svg"} alt="" className="h-full w-full object-contain" />
      </span>
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
        {salonName ?? "ZelyraOne for Business"}
      </p>
      <button
        type="button"
        id="app-nav-toggle"
        aria-expanded={open}
        aria-controls="app-sidebar-nav"
        aria-label={open ? "Close navigation" : "Open navigation"}
        onClick={onToggle}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-slate-600 hover:bg-slate-100"
      >
        {open ? (
          <svg viewBox="0 0 16 16" width="18" height="18" fill="none" aria-hidden="true" focusable="false">
            <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="18" height="18" fill="none" aria-hidden="true" focusable="false">
            <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </header>
  );
}
