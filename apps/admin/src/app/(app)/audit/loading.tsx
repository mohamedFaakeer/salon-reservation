import { TableSkeleton } from "../../../components/loading-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Audit</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Who changed what, newest first. Entries are never edited or removed.
        </p>
      </div>
      <TableSkeleton rows={8} />
    </div>
  );
}
