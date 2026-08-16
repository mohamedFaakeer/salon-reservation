"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Kept in sync with --motion-overlay-exit in globals.css. */
const EXIT_MS = 220;

/**
 * Modal drawer chrome shared by BookingDrawer and AppointmentDetailDrawer.
 *
 * Both were previously bare `fixed inset-0` overlays: no dialog role, no
 * accessible name, no Escape, no focus containment, and an unlabelled "✕"
 * glyph at 2.56:1 contrast. Since these two drawers are where every booking,
 * cancellation, refund and reschedule happens, that locked keyboard and
 * screen-reader users out of the core staff workflow. Centralising the chrome
 * keeps the two from drifting apart again.
 */
export function DrawerShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Play the exit before unmounting. The parent owns the drawer's existence, so
   * we hold it on screen for the exit duration and only then report the close.
   * Guarded against double-invocation (Escape while a backdrop click is already
   * animating out) so `onClose` fires exactly once.
   */
  const requestClose = useCallback(() => {
    if (closeTimer.current) {
      return;
    }
    setClosing(true);
    closeTimer.current = setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(
    () => () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
      }
    },
    [],
  );

  // Remember what opened the drawer so focus can go back there on close —
  // otherwise focus falls to <body> and keyboard users lose their place.
  useEffect(() => {
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => {
      restoreFocusTo.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== "Tab") {
        return;
      }
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      // Wrap at the ends so Tab cannot walk out into the page behind the modal.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [requestClose]);

  return (
    <div
      className="motion-scrim fixed inset-0 z-40 flex justify-end bg-black/30"
      style={closing ? { animationDirection: "reverse" } : undefined}
      // Clicking the backdrop dismisses, matching every other modal on the web.
      // Guarded so clicks inside the panel don't bubble up and close it.
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          requestClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // The panel travels in from the edge it is docked to, which is what
        // makes it read as a layer over the day board rather than a new page.
        className="motion-slide-in flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-xl"
        style={
          closing ? { animationDirection: "reverse", animationDuration: EXIT_MS + "ms" } : undefined
        }
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label={`Close ${title.toLowerCase()}`}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Drawn rather than a "✕" glyph, so it carries the same stroke weight as Spinner. */
function CloseIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
