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

export type TaPhaseStage = "phase1" | "phase2" | "phase3";

/** Promotion order of finals stages, used to find which stages come "after" a given stage. */
const TA_PHASE_ORDER: readonly TaPhaseStage[] = ["phase1", "phase2", "phase3"];

/**
 * Mirrors the guard enforced server-side by resetPhase() in
 * finals-phase-manager.ts (and the BM/MR/GP canResetFinalsFromQualification
 * pattern): a phase's "reset" (undo promotion) button should only be shown
 * when the phase actually has entries to delete, and no later phase has
 * been promoted from it yet. Later phases are built by reading the earlier
 * phase's survivors, so resetting phase1 out from under an existing phase2
 * would leave phase2 with no record of where its "phase1 survivors" half
 * came from — resets must happen in reverse order: phase3 -> phase2 -> phase1.
 */
export function canResetTaPhase({
  phaseStatus,
  stage,
}: {
  phaseStatus: TaPhaseStatus;
  stage: TaPhaseStage;
}): boolean {
  if (!phaseStatus?.[stage]) return false;
  const laterStages = TA_PHASE_ORDER.slice(TA_PHASE_ORDER.indexOf(stage) + 1);
  return laterStages.every((laterStage) => !phaseStatus[laterStage]);
}
