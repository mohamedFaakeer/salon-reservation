import { TableSkeleton } from "../../../components/loading-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Services</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          What the salon sells, how long it takes, what it costs.
        </p>
      </div>
      <TableSkeleton rows={5} />
    </div>
  );
}
