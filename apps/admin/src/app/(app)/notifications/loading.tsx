import { TableSkeleton } from "../../../components/loading-skeleton";

/** Route-level fallback so navigating into Notifications is never blank. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-7 w-40 skeleton rounded-md" />
      <TableSkeleton />
    </div>
  );
}
