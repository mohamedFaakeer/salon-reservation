import { ServiceListSkeleton } from "../../../components/loading-skeleton";

/** Route-level fallback while a salon's profile and services resolve. */
export default function Loading() {
  return (
    <main className="mx-auto max-w-lg p-4">
      <div className="mb-6">
        <div className="h-8 w-56 skeleton rounded-md" />
        <div className="mt-2 h-4 w-40 skeleton rounded-md" />
      </div>
      <ServiceListSkeleton />
    </main>
  );
}
