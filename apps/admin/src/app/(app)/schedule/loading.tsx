import { CalendarSkeleton } from "../../../components/loading-skeleton";

export default function ScheduleLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="h-6 w-40 rounded bg-slate-200" />
        <div className="mt-1 h-4 w-72 rounded bg-slate-100" />
      </div>
      <CalendarSkeleton />
    </div>
  );
}