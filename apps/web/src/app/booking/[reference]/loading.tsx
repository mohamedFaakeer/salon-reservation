import { BookingDetailSkeleton } from "../../../components/loading-skeleton";

/** Route-level fallback while a booking lookup resolves. */
export default function Loading() {
  return (
    <main className="mx-auto max-w-lg p-4">
      <div className="h-8 w-64 skeleton rounded-md" />
      <div className="mt-2 h-4 w-32 skeleton rounded-md" />
      <div className="mt-6">
        <BookingDetailSkeleton />
      </div>
    </main>
  );
}
