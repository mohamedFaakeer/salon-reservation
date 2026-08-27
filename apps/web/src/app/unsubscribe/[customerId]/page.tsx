"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ApiRequestError, confirmUnsubscribe, fetchUnsubscribeInfo, type UnsubscribeInfo } from "../../../lib/api-client";

/**
 * DECISIONS.md §43 — the public, no-login link carried in marketing/win-back
 * messages. No login — the customer id in the URL is the only credential,
 * same pattern as `/receipts/[id]` and `/booking/[reference]`. Deliberately
 * a confirm-then-submit page, not a bare GET-triggers-the-action link: an
 * SMS/email link preview crawler fetching the URL to render a preview must
 * not silently opt someone out — only the explicit button press does.
 */
export default function UnsubscribePage() {
  const { customerId } = useParams<{ customerId: string }>();
  const [info, setInfo] = useState<UnsubscribeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchUnsubscribeInfo(customerId)
      .then((view) => {
        if (!cancelled) setInfo(view);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiRequestError && err.statusCode === 404
            ? "This link is no longer valid."
            : "Couldn't load this page. Please try again in a moment.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  async function handleConfirm(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await confirmUnsubscribe(customerId);
      setDone(true);
    } catch {
      setError("Couldn't process this. Please try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 pb-16 pt-8">
        <UnsubscribeSkeleton />
      </main>
    );
  }

  if (error || !info) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 pb-16 pt-8">
        <h1 className="text-2xl font-bold text-[var(--resist)]">Unsubscribe</h1>
        <p role="alert" className="mt-4 text-[13px] font-semibold text-[#E4867F]">
          {error ?? "Couldn't load this page."}
        </p>
      </main>
    );
  }

  const alreadyDone = done || info.alreadyOptedOut;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 pb-16 pt-8 text-center">
      {alreadyDone ? (
        <>
          <h1 className="text-2xl font-bold text-[var(--resist)]">You're unsubscribed</h1>
          <p className="mt-3 text-[13px] text-[var(--resist-dim)]">
            {info.customerFirstName}, you won't receive marketing messages from{" "}
            <span className="font-semibold text-[var(--bloom)]">{info.salonName}</span> anymore. You'll still hear
            from them about appointments you book yourself.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-[var(--resist)]">Stop marketing messages?</h1>
          <p className="mt-3 text-[13px] text-[var(--resist-dim)]">
            Hi {info.customerFirstName}, this will stop{" "}
            <span className="font-semibold text-[var(--bloom)]">{info.salonName}</span> from sending you win-back
            offers and other marketing messages. You'll still get messages about appointments you book yourself.
          </p>
          {error ? (
            <p role="alert" className="mt-4 text-[13px] font-semibold text-[#E4867F]">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="mt-6 rounded-[var(--radius)] bg-[var(--dye)] px-5 py-3 text-[14px] font-bold text-[#022b27] disabled:opacity-60"
          >
            {submitting ? "Unsubscribing…" : "Yes, unsubscribe me"}
          </button>
        </>
      )}
    </main>
  );
}

function UnsubscribeSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <div className="h-7 w-48 rounded-md bg-[rgba(240,231,214,0.08)]" />
      <div className="mt-3 h-4 w-full rounded-md bg-[rgba(240,231,214,0.08)]" />
      <div className="mt-2 h-4 w-2/3 rounded-md bg-[rgba(240,231,214,0.08)]" />
    </div>
  );
}
