"use client";

/**
 * Phase 1 Page - TA Finals Losers Round 1
 *
 * Thin wrapper around the shared TAEliminationPhase component.
 * Phase 1 takes qualification ranks 17-24 (8 players) and eliminates
 * down to 4 survivors through course-by-course elimination.
 */

import { use } from "react";
import TAEliminationPhase from "@/components/tournament/ta-elimination-phase";

export default function Phase1Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  return (
    <TAEliminationPhase
      tournamentId={tournamentId}
      phase="phase1"
      title="Phase 1"
      description="Qualification ranks 17-24 (8 players → 4 survivors)"
      targetSurvivors={4}
    />
  );
}
