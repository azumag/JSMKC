/**
 * Battle Mode Qualification Page — Server Component shell with PPR
 *
 * With PPR enabled (`experimental_ppr = true`), Next.js pre-renders the static
 * shell (the Suspense fallback skeleton) at build time and streams the dynamic
 * D1 data per request. This eliminates the blank-page wait: users see the
 * loading skeleton immediately from cache, then the live standings stream in.
 *
 * The inner `BmContent` async component accesses dynamic params and calls Prisma,
 * so it is automatically treated as a dynamic island — no `force-dynamic` needed.
 */

import { Suspense } from 'react';
import BattleModePageClient from './page-client';
import { fetchQualInitialData } from '@/lib/api-factories/qual-initial-data';
import { bmConfig } from '@/lib/event-types';
import { CardSkeleton, TableSkeleton } from '@/components/ui/loading-skeleton';

export default function BattleModePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<BmFallback />}>
      <BmContent params={params} />
    </Suspense>
  );
}

async function BmContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const initialData = await fetchQualInitialData(bmConfig, id);
  return <BattleModePageClient tournamentId={id} initialData={initialData} />;
}

function BmFallback() {
  return (
    <div className="space-y-6">
      <CardSkeleton />
      <TableSkeleton rows={8} columns={5} />
    </div>
  );
}
