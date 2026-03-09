"use client";

/**
 * Phase 2 Page - TA Finals Losers Round 2
 *
 * Thin wrapper around the shared TAEliminationPhase component.
 * Phase 2 combines Phase 1 survivors (4) + qualification ranks 13-16 (4)
 * for a total of 8 players, eliminating down to 4 survivors.
 */

import { use } from "react";
import { useTranslations } from 'next-intl';
import TAEliminationPhase from "@/components/tournament/ta-elimination-phase";

export default function Phase2Page({
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
      phase="phase2"
      title={tTaFinals('phase2Title')}
      description={tTaFinals('phase2Desc')}
      targetSurvivors={4}
    />
  );
}
