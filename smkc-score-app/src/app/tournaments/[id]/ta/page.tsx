/**
 * Time Attack Qualification Page — Server Component shell with PPR
 *
 * With PPR enabled (`experimental_ppr = true`), Next.js pre-renders the static
 * shell (the Suspense fallback skeleton) at build time and streams the dynamic
 * D1 data per request. This eliminates the blank-page wait: users see the
 * loading skeleton immediately from cache, then the live standings stream in.
 *
 * The inner `TaContent` async component accesses dynamic params and calls Prisma,
 * so it is automatically treated as a dynamic island — no `force-dynamic` needed.
 * Tournament data changes in real time; no static caching occurs because params
 * is a dynamic route segment.
 */

import { Suspense } from 'react';
import TimeAttackPageClient from './page-client';
import { fetchTaInitialData } from '@/lib/ta/initial-data';
import { CardSkeleton, TableSkeleton } from '@/components/ui/loading-skeleton';

export default function TimeAttackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<TaFallback />}>
      <TaContent params={params} />
    </Suspense>
  );
}

async function TaContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const initialData = await fetchTaInitialData(id);
  return <TimeAttackPageClient tournamentId={id} initialData={initialData} />;
}

function TaFallback() {
  return (
    <div className="space-y-6">
      <CardSkeleton />
      <TableSkeleton rows={8} columns={5} />
    </div>
  );
}
