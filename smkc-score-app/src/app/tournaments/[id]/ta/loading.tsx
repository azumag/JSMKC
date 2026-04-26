/**
 * Suspense fallback for the TA qualification route.
 *
 * When the TA page (or any descendant) suspends — e.g. waiting on the
 * server-side initial fetch in a future RSC migration — Next.js renders
 * this component in its place so the user sees structural placeholders
 * instead of a blank screen. Today the page is a pure client component,
 * so this fires only briefly during code-split JS load; once the page is
 * RSC-ified it'll cover the data fetch too.
 */
import { CardSkeleton, TableSkeleton } from '@/components/ui/loading-skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <CardSkeleton />
      <TableSkeleton rows={8} columns={6} />
    </div>
  );
}
