import {
  CalendarSkeleton,
  ListSkeleton,
  StatsSkeleton,
} from "../../../components/loading-skeleton";

/**
 * Route-level fallback for client-side navigation into Today.
 *
 * Since the admin nav became a real client-side transition (next/link, P18.5),
 * a hop from Notifications had nothing to show while this route's data
 * resolved. This mirrors the page's own loading branch so the two are
 * indistinguishable to the user.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-7 w-64 skeleton rounded-md" />
      <StatsSkeleton />
      <div className="hidden lg:block">
        <CalendarSkeleton />
      </div>
      <div className="lg:hidden">
        <ListSkeleton />
      </div>
    </div>
  );
}
