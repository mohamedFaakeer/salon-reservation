"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** No real activity for this long ends the session, even if the underlying tokens are still valid. */
const IDLE_TIMEOUT_MS = 30 * 60_000;
/** How long before the idle timeout the warning dialog appears, then counts down to 0. */
const WARNING_LEAD_MS = 60_000;
/** How often the idle clock is checked — frequent enough for a smooth countdown, cheap enough to leave running. */
const CHECK_INTERVAL_MS = 1000;

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

export interface IdleTimeoutState {
  /** Seconds remaining before auto-logout, once the warning dialog has appeared; null while the user is still active. */
  warningSecondsLeft: number | null;
  /** Cancels the warning and resets the idle clock — call on any explicit "stay signed in" action. */
  stayActive: () => void;
}

/**
 * Client-side idle (inactivity) timeout, layered on top of the token/refresh
 * machinery in `api-client.ts`. The server has no visibility into mouse
 * movement, so this is enforced in the browser — the same shape virtually
 * every SPA uses (Auth0, AWS Amplify, etc. all do this client-side). Separate
 * from, and shorter than, the server-side absolute session cap.
 */
export function useIdleTimeout(enabled: boolean, onTimeout: () => void): IdleTimeoutState {
  const lastActivityRef = useRef(Date.now());
  const firedRef = useRef(false);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState<number | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const stayActive = useCallback(() => {
    lastActivityRef.current = Date.now();
    setWarningSecondsLeft(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setWarningSecondsLeft(null);
      return;
    }

    firedRef.current = false;
    lastActivityRef.current = Date.now();
    const handleActivity = () => stayActive();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));

    const interval = window.setInterval(() => {
      if (firedRef.current) {
        return;
      }
      const remainingMs = IDLE_TIMEOUT_MS - (Date.now() - lastActivityRef.current);
      if (remainingMs <= 0) {
        firedRef.current = true;
        setWarningSecondsLeft(null);
        onTimeoutRef.current();
        return;
      }
      setWarningSecondsLeft(remainingMs <= WARNING_LEAD_MS ? Math.ceil(remainingMs / 1000) : null);
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleActivity));
      window.clearInterval(interval);
    };
  }, [enabled, stayActive]);

  return { warningSecondsLeft, stayActive };
}
