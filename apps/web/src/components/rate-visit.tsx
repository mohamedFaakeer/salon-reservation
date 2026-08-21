"use client";

import { useState } from "react";
import { ApiRequestError, submitRating, type RatingView } from "../lib/api-client";
import { DyeButton, Marker } from "./cloth";
import { BusyLabel } from "./spinner";

/**
 * Rate a finished visit.
 *
 * Offered only once the salon has marked the appointment complete — the server
 * refuses anything else, and asking before the visit happened would be asking
 * about nothing.
 *
 * Stars are real radio inputs in a fieldset rather than clickable spans, so the
 * control is reachable by keyboard, announced as a group, and submits without
 * JavaScript having to invent the semantics. A rating cannot be changed once
 * given, and the copy says so before the button rather than after.
 */

const LABELS = ["Poor", "Not great", "Fine", "Good", "Excellent"];

export function RateVisit({
  reference,
  phone,
  existing,
}: {
  reference: string;
  phone: string;
  /** Already rated. Show what they said rather than a form the server will refuse. */
  existing: RatingView | null;
}) {
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (existing) {
    return <AlreadyRated rating={existing} />;
  }

  async function submit(): Promise<void> {
    if (score === 0) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitRating(reference, { phone, score, comment: comment.trim() || undefined });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "That didn't send. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <section
        role="status"
        className="rounded-[var(--radius)] border border-[var(--dye)] p-4 text-center"
      >
        <p className="display text-[20px] text-[var(--resist)]">Thank you.</p>
        <p className="mt-1 text-[12.5px] text-[var(--resist-dim)]">
          The salon can see your rating.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[var(--radius)] border border-[rgba(240,231,214,0.2)] p-4">
      <h2 className="display text-[22px] text-[var(--resist)]">How was it?</h2>

      <fieldset className="mt-3 border-0 p-0">
        <legend className="sr-only">Score out of five</legend>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className={`flex min-h-12 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] border-[1.5px] py-2.5 transition-colors duration-[var(--t-tap)] ${
                score >= value
                  ? "border-[var(--dye)] bg-[var(--dye)] text-[#022B27]"
                  : "border-[rgba(240,231,214,0.22)] text-[rgba(240,231,214,0.45)] hover:border-[var(--bloom)]"
              }`}
            >
              <input
                type="radio"
                name="score"
                value={value}
                checked={score === value}
                onChange={() => setScore(value)}
                data-testid={`rating-${value}`}
                className="sr-only"
              />
              <Star filled={score >= value} />
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.06em]">
                {value}
              </span>
            </label>
          ))}
        </div>
        <p
          className="mt-2 h-4 text-center text-[12px] text-[var(--bloom)]"
          aria-live="polite"
        >
          {score > 0 ? LABELS[score - 1] : ""}
        </p>
      </fieldset>

      <label className="mt-2 flex flex-col gap-1.5 text-[13px] font-semibold text-[var(--resist)]">
        Anything to add?
        <span className="font-normal text-[var(--resist-dim)]">Optional</span>
        <textarea
          data-testid="rating-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={1000}
          className="rounded-[var(--radius-sm)] border-[1.5px] border-[rgba(240,231,214,0.22)] bg-transparent px-3.5 py-2.5 text-[15px] font-normal text-[var(--resist)] outline-none focus:border-[var(--bloom)]"
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-[var(--radius-sm)] border border-[#E4867F] p-3 text-[13px] font-semibold text-[#E4867F]"
        >
          {error}
        </p>
      ) : null}

      <p className="mt-3">
        <Marker>You can only rate a visit once</Marker>
      </p>

      <DyeButton
        testId="submit-rating"
        onClick={() => void submit()}
        disabled={score === 0 || submitting}
        className="mt-2 w-full"
      >
        <BusyLabel busy={submitting} busyText="Sending…">
          Send rating
        </BusyLabel>
      </DyeButton>
    </section>
  );
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M10 1.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8L10 1.8Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlreadyRated({ rating }: { rating: RatingView }) {
  return (
    <section className="rounded-[var(--radius)] border border-[rgba(240,231,214,0.2)] p-4">
      <h2 className="display text-[20px] text-[var(--resist)]">You rated this visit</h2>
      <p className="mt-2 flex items-center gap-1.5 text-[var(--dye)]">
        {[1, 2, 3, 4, 5].map((v) => (
          <Star key={v} filled={rating.score >= v} />
        ))}
        <span className="ml-1 text-[13px] font-bold text-[var(--resist)]">{rating.score} / 5</span>
      </p>
      {rating.comment ? (
        <p className="mt-2 text-[13px] italic text-[var(--resist-dim)]">
          &ldquo;{rating.comment}&rdquo;
        </p>
      ) : null}
    </section>
  );
}
