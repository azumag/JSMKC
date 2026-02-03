"use client";

/**
 * Phase 1 Page - TA Finals Losers Round 1
 *
 * Thin wrapper around the shared TAEliminationPhase component.
 * Phase 1 takes qualification ranks 17-24 (8 players) and eliminates
 * down to 4 survivors through course-by-course elimination.
 */

import { use } from "react";
import { useTranslations } from 'next-intl';
import TAEliminationPhase from "@/components/tournament/ta-elimination-phase";

export default function Phase1Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  /** i18n: Use taFinals namespace for phase title and description */
  const tTaFinals = useTranslations('taFinals');

  return (
    <TAEliminationPhase
      tournamentId={tournamentId}
      phase="phase1"
      title={tTaFinals('phase1Title')}
      description={tTaFinals('phase1Desc')}
      targetSurvivors={4}
    />
  );
}
