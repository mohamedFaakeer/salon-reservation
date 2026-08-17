import { TableSkeleton } from "../../../components/loading-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Staff &amp; skills</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Who works here, and what each of them can do.
        </p>
      </div>
      <TableSkeleton rows={4} />
    </div>
  );
}
