import { LockClockIcon, LogIcon, ReceiptIcon, ShieldIcon } from "./icons";
import { Reveal } from "./reveal";

const ITEMS = [
  {
    icon: ShieldIcon,
    title: "No double-booking, enforced by the database",
    body: "Two people can't be handed the same chair at the same time — the database itself refuses the second write, not a careful check by staff.",
  },
  {
    icon: LockClockIcon,
    title: "Your data stays your salon's",
    body: "Every salon's records are isolated at the data layer. There's no setting to misconfigure, and no other business can see your customers.",
  },
  {
    icon: ReceiptIcon,
    title: "History doesn't change when your prices do",
    body: "Every appointment keeps the exact price and duration it was booked at, even after you update your price list.",
  },
  {
    icon: LogIcon,
    title: "Every action is logged",
    body: "Price changes, cancellations, and refunds are all recorded — with who did it, and when.",
  },
];

export function TrustSection() {
  return (
    <section id="trust" className="bg-[var(--navy)] py-16 sm:py-20">
      <Reveal as="section" className="mx-auto max-w-[1120px] px-6 text-white">
        <h2 className="text-[clamp(24px,3.4vw,32px)] font-bold text-white">
          Trust built into the database, not promised in a pitch.
        </h2>
        <p className="mt-3 max-w-[62ch] text-[#94A3B8]">
          This is true whether you&rsquo;re the salon running the day, or the customer booking a slot.
        </p>
        <div className="mt-8 flex flex-col">
          {ITEMS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="grid grid-cols-[40px_1fr] gap-6 border-t border-[#1E293B] py-6 last:border-b">
              <div className="flex h-10 w-10 items-center justify-center rounded-[var(--r-default)] bg-[var(--teal-tint)] text-[var(--teal-dark)]">
                <Icon />
              </div>
              <div>
                <h4 className="text-white">{title}</h4>
                <p className="mt-1 text-[#94A3B8]">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
