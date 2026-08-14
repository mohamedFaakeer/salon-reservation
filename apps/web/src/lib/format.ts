export function formatPriceCents(cents: number): string {
  return `Rs. ${(cents / 100).toLocaleString("en-LK", { maximumFractionDigits: 0 })}`;
}

export function formatDurationMin(min: number): string {
  if (min < 60) {
    return `${min} min`;
  }
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-LK", { hour: "numeric", minute: "2-digit" });
}

export function formatDateLong(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-LK", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
