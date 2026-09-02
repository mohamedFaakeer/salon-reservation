/**
 * The "Salon Mehrish · Today" live-availability card. Moved here verbatim
 * from hero.tsx (no markup or class changes) when the hero's right side
 * became the orbit animation instead — this card now lives in the
 * Founding 50 section (founding-banner.tsx).
 */
export function AvailabilityPanel() {
  return (
    <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] p-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--slate)]">
            Salon Mehrish &middot; Today
          </div>
          <h4 className="mt-0.5 text-base font-medium">Colombo 05</h4>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--success)]">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
          Live availability
        </span>
      </div>

      <div className="flex flex-col gap-2.5 px-6 pb-6 pt-4">
        <Slot time="9:00" status="open" />
        <Slot time="9:30" status="animated" name="Ishara &middot; Hair Cut" />
        <Slot time="10:00" status="open" />
        <Slot time="10:30" status="booked" name="Dinithi &middot; Gel Manicure" />
      </div>

      <div className="border-t border-[var(--border)] bg-[#F8FAFC] px-6 py-3.5 text-[13px] text-[var(--slate)]">
        The 9:30 slot just filled — <strong className="text-[var(--navy)]">the database refuses a second booking on it</strong>, from any channel.
      </div>
    </div>
  );
}

function Slot({
  time,
  status,
  name,
}: {
  time: string;
  status: "open" | "booked" | "animated";
  name?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-[var(--r-default)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-sm ${
        status === "animated" ? "slot-animated" : ""
      }`}
    >
      <span className="w-[52px] font-[var(--font-mono)] text-[13px] font-semibold tabular-nums text-[var(--navy)]">
        {time}
      </span>
      <span className="flex-1 px-2 text-[var(--slate)]">
        {status === "animated" ? <span className="who-reveal">{name}</span> : status === "booked" ? name : "Open"}
      </span>
      {status === "open" && (
        <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-semibold text-[var(--slate)]">Open</span>
      )}
      {status === "booked" && (
        <span className="rounded-full bg-[var(--success-tint)] px-2.5 py-1 text-xs font-semibold text-[var(--status-success-ink)]">
          Booked
        </span>
      )}
      {status === "animated" && (
        <>
          <span className="pill-open rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-semibold text-[var(--slate)]">
            Open
          </span>
          <span className="pill-booked rounded-full bg-[var(--success-tint)] px-2.5 py-1 text-xs font-semibold text-[var(--status-success-ink)]">
            Booked
          </span>
        </>
      )}
    </div>
  );
}
