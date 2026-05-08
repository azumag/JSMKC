export type TaPhaseStatus = {
  phase1: { total: number; active: number; eliminated: number } | null;
  phase2: { total: number; active: number; eliminated: number } | null;
  phase3: { total: number; active: number; eliminated: number; winner: string | null } | null;
  currentPhase: string;
} | null;

export function hasStartedTaPhase(phaseStatus: TaPhaseStatus): boolean {
  return Boolean(phaseStatus?.phase1 || phaseStatus?.phase2 || phaseStatus?.phase3);
}

export function shouldShowTaFinalsPhaseManagement({
  entriesCount,
  frozenStages,
  phaseStatus,
}: {
  entriesCount: number;
  frozenStages: string[];
  phaseStatus: TaPhaseStatus;
}): boolean {
  return entriesCount > 0 && (
    frozenStages.includes("qualification") || hasStartedTaPhase(phaseStatus)
  );
}

export function canShowTaPhasePromotion({
  phaseStatusLoaded,
  promotingPhase,
}: {
  phaseStatusLoaded: boolean;
  promotingPhase: string | null;
}): boolean {
  return phaseStatusLoaded && promotingPhase === null;
}
