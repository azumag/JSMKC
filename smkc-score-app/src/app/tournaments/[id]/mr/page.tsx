/**
 * Match Race Qualification Page — Server Component shell with PPR
 *
 * With PPR enabled (`experimental_ppr = true`), Next.js pre-renders the static
 * shell (the Suspense fallback skeleton) at build time and streams the dynamic
 * D1 data per request. This eliminates the blank-page wait: users see the
 * loading skeleton immediately from cache, then the live standings stream in.
 *
 * The inner `MrContent` async component accesses dynamic params and calls Prisma,
 * so it is automatically treated as a dynamic island — no `force-dynamic` needed.
 */

import { Suspense } from 'react';
import MatchRacePageClient from './page-client';
import { fetchQualInitialData } from '@/lib/api-factories/qual-initial-data';
import { mrConfig } from '@/lib/event-types';
import { CardSkeleton, TableSkeleton } from '@/components/ui/loading-skeleton';

export default function MatchRacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MrFallback />}>
      <MrContent params={params} />
    </Suspense>
  );
}

async function MrContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const initialData = await fetchQualInitialData(mrConfig, id);
  return <MatchRacePageClient tournamentId={id} initialData={initialData} />;
}

function MrFallback() {
  return (
    <div className="space-y-6">
      <CardSkeleton />
      <TableSkeleton rows={8} columns={5} />
    </div>
  );
}
