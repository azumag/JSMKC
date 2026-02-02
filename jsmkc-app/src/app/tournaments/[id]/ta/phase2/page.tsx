"use client";

/**
 * Phase 2 Page - TA Finals Losers Round 2
 *
 * Thin wrapper around the shared TAEliminationPhase component.
 * Phase 2 combines Phase 1 survivors (4) + qualification ranks 13-16 (4)
 * for a total of 8 players, eliminating down to 4 survivors.
 */

import { use } from "react";
import TAEliminationPhase from "@/components/tournament/ta-elimination-phase";

export default function Phase2Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);

  return (
    <TAEliminationPhase
      tournamentId={tournamentId}
      phase="phase2"
      title="Phase 2"
      description="Phase 1 survivors + Qualification ranks 13-16 (8 players → 4 survivors)"
      targetSurvivors={4}
    />
  );
}
