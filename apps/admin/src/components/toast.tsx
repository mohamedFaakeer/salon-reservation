"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Toasts announce *outcomes* — things that already happened, usually somewhere
 * the operator is no longer looking. They never replace an inline field error,
 * which belongs beside the field that is wrong.
 *
 * The three tones behave differently on purpose, because they are not equally
 * urgent:
 *
 *   success  dismisses itself after 4s. role="status", announced politely.
 *            The work is done; nothing is owed.
 *   warning  stays until dismissed. Something needs a decision.
 *   error    stays until dismissed, role="alert". An error that vanishes while
 *            someone is reading it is worse than no message at all, and an
 *            operator who missed it has no way to get it back.
 *
 * Every error toast must name the problem *and* the recovery. "Something went
 * wrong" is banned by CLAUDE.md §5; so is anything that only a developer could
 * act on.
 */

export type ToastTone = "success" | "warning" | "error";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  /** What to do next. Required on error and warning — that is the point. */
  detail?: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  /** Something finished. Auto-dismisses. */
  success: (title: string, detail?: string) => void;
  /** Something needs a decision. Stays. */
  warn: (title: string, detail?: string, action?: Toast["action"]) => void;
  /** Something failed. Stays. `detail` says how to recover. */
  error: (title: string, detail?: string, action?: Toast["action"]) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const SUCCESS_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId.current;
      nextId.current += 1;
      // Newest first: the thing that just happened is what you look at.
      setToasts((prev) => [{ ...toast, id }, ...prev].slice(0, 4));
      if (toast.tone === "success") {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), SUCCESS_MS),
        );
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  const api: ToastApi = {
    success: useCallback((title, detail) => push({ tone: "success", title, detail }), [push]),
    warn: useCallback(
      (title, detail, action) => push({ tone: "warning", title, detail, action }),
      [push],
    ),
    error: useCallback(
      (title, detail, action) => push({ tone: "error", title, detail, action }),
      [push],
    ),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

const TONE: Record<ToastTone, { wrap: string; icon: ReactNode; label: string }> = {
  success: {
    wrap: "border-emerald-300 bg-emerald-50 text-emerald-900",
    label: "Done",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.4" stroke="#047857" strokeWidth="1.4" />
        <path
          d="M5.2 8.2 7.1 10.1l3.7-3.9"
          stroke="#047857"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  warning: {
    wrap: "border-amber-300 bg-amber-50 text-amber-900",
    label: "Check this",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 2.4 14.4 13H1.6L8 2.4Z" stroke="#92400E" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8 6.6v2.6" stroke="#92400E" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11.1" r="0.75" fill="#92400E" />
      </svg>
    ),
  },
  error: {
    wrap: "border-red-300 bg-red-50 text-red-900",
    label: "Didn't work",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.4" stroke="#B91C1C" strokeWidth="1.4" />
        <path d="m5.8 5.8 4.4 4.4M10.2 5.8l-4.4 4.4" stroke="#B91C1C" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
};

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    // Bottom-right on desktop, full width on mobile where a corner card would
    // crowd the thumb. aria-live is on the region so a toast rendered into an
    // already-present container is announced.
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 p-4 sm:inset-x-auto sm:right-0 sm:w-[26rem]"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const tone = TONE[toast.tone];
        return (
          <div
            key={toast.id}
            data-testid={`toast-${toast.tone}`}
            role={toast.tone === "error" ? "alert" : "status"}
            aria-live={toast.tone === "error" ? "assertive" : "polite"}
            className={`anim-rise pointer-events-auto flex items-start gap-3 rounded-lg border px-3.5 py-3 shadow-[0_12px_28px_-16px_rgba(15,23,42,0.5)] ${tone.wrap}`}
          >
            <span className="mt-0.5 shrink-0">{tone.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.detail ? <p className="mt-0.5 text-xs">{toast.detail}</p> : null}
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    onDismiss(toast.id);
                  }}
                  className="mt-2 min-h-11 rounded border border-current px-2.5 text-xs font-semibold"
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label={`Dismiss: ${toast.title}`}
              className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded opacity-60 hover:opacity-100"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
