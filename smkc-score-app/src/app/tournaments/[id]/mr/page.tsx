/**
 * Match Race Qualification Page — Server Component shell with RSC streaming
 *
 * The outer component immediately returns a <Suspense> boundary so the loading
 * skeleton is sent to the client before the D1 data fetch completes (RSC
 * streaming). The inner async `MrContent` awaits Prisma and renders the client
 * component with pre-fetched `initialData`, eliminating the blank-page wait.
 *
 * Dynamic route params make this page server-rendered per request; no
 * `force-dynamic` override is needed.
 */

import { Suspense } from 'react';
import MatchRacePageClient from './page-client';
import { fetchQualInitialData } from '@/lib/api-factories/qual-initial-data';
import { mrConfig } from '@/lib/event-types';
import { QualificationFallback } from '@/components/ui/loading-skeleton';
import { useTranslations } from 'next-intl';

export default function MatchRacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = useTranslations('mr');
  return (
    <Suspense fallback={<QualificationFallback title={t('title')} />}>
      <MrContent params={params} />
    </Suspense>
  );
}

async function MrContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const initialData = await fetchQualInitialData(mrConfig, id);
  return <MatchRacePageClient tournamentId={id} initialData={initialData} />;
}
