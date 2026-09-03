"use client";

/**
 * Warns before the idle-timeout auto-logout fires (`useIdleTimeout`), so
 * nobody silently loses an unsaved appointment or drawer form. Centered
 * modal pattern matches `BarcodeScannerModal` rather than `DrawerShell`,
 * which is the side-panel form pattern used elsewhere in this app.
 */
export function IdleWarningDialog({
  secondsLeft,
  onStayActive,
}: {
  secondsLeft: number;
  onStayActive: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-warning-title"
      aria-describedby="idle-warning-body"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
        <h2 id="idle-warning-title" className="text-base font-semibold text-slate-900">
          Still there?
        </h2>
        <p id="idle-warning-body" className="mt-2 text-sm text-slate-600">
          You've been idle. For security, you'll be signed out in{" "}
          <span className="font-semibold tabular-nums text-slate-900">{secondsLeft}s</span>.
        </p>
        <button
          type="button"
          onClick={onStayActive}
          data-testid="idle-warning-stay-active"
          className="mt-5 min-h-11 w-full rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
