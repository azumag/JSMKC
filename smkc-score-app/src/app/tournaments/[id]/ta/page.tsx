/**
 * Time Attack Qualification Page — Server Component shell with RSC streaming
 *
 * The outer component immediately returns a <Suspense> boundary so the loading
 * skeleton is sent to the client before the D1 data fetch completes (RSC
 * streaming). The inner async `TaContent` awaits Prisma and renders the client
 * component with pre-fetched `initialData`, eliminating the blank-page wait.
 *
 * Dynamic route params make this page server-rendered per request; no
 * `force-dynamic` override is needed. Tournament data changes in real time;
 * the Prisma call is inherently dynamic.
 */

import { Suspense } from 'react';
import TimeAttackPageClient from './page-client';
import { fetchTaInitialData } from '@/lib/ta/initial-data';
import { QualificationFallback } from '@/components/ui/loading-skeleton';

export default function TimeAttackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<QualificationFallback />}>
      <TaContent params={params} />
    </Suspense>
  );
}

async function TaContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const initialData = await fetchTaInitialData(id);
  return <TimeAttackPageClient tournamentId={id} initialData={initialData} />;
}
