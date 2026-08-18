import { SettingsSkeleton } from "../../../components/loading-skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          The rules every booking, cancellation and refund is measured against.
        </p>
      </div>
      <SettingsSkeleton />
    </div>
  );
}
