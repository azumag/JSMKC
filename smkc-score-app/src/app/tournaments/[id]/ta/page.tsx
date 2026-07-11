/**
 * Time Attack entry page — Server Component shell with RSC streaming.
 *
 * Standard TA keeps the qualification workflow. TA battle royale skips
 * qualification entirely: before start it renders the direct Phase 3 roster
 * setup, and after start it redirects straight to the Phase 3 finals page.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import TimeAttackPageClient from './page-client';
import BattleRoyaleSetupClient from './battle-royale-setup-client';
import { fetchTaInitialData } from '@/lib/ta/initial-data';
import { QualificationFallback } from '@/components/ui/loading-skeleton';
import { useTranslations } from 'next-intl';
import { resolveTournament } from '@/lib/tournament-identifier';
import prisma from '@/lib/prisma';

export default function TimeAttackPage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations('ta');
  return (
    <Suspense fallback={<QualificationFallback title={t('title')} />}>
      <TaContent params={params} />
    </Suspense>
  );
}

async function TaContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await resolveTournament(id, {
    id: true,
    taBattleRoyaleMode: true,
  });

  if (tournament?.taBattleRoyaleMode) {
    const phase3Entry = await prisma.tTEntry.findFirst({
      where: { tournamentId: tournament.id, stage: 'phase3' },
      select: { id: true },
    });
    if (phase3Entry) {
      redirect(`/tournaments/${id}/ta/finals`);
    }
    return <BattleRoyaleSetupClient tournamentId={id} />;
  }

  const initialData = await fetchTaInitialData(id);
  return <TimeAttackPageClient tournamentId={id} initialData={initialData} />;
}
