import { TableSkeleton } from "../../../components/loading-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Payments</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Every amount taken, newest first. Refunds are issued from a booking, not from here.
        </p>
      </div>
      <TableSkeleton rows={6} />
    </div>
  );
}
