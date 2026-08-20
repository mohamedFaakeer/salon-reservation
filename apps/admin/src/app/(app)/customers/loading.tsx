import { TableSkeleton } from "../../../components/loading-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Everyone who has booked, by name or phone number.
        </p>
      </div>
      <TableSkeleton rows={6} />
    </div>
  );
}
