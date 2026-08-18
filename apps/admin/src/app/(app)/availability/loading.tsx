import { TableSkeleton } from "../../../components/loading-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Availability</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Working hours, time off, and salon closures.
        </p>
      </div>
      <TableSkeleton rows={4} />
    </div>
  );
}
