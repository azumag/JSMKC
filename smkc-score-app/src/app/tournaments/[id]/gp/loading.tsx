/**
 * Suspense fallback for the GP qualification route.
 * See ./../ta/loading.tsx for design notes.
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
