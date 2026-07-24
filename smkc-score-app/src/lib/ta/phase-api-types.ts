import type { TaHandicapSeconds } from '@/lib/ta/battle-royale';

export type TaMode = 'standard' | 'battle_royale';

export interface Phase3RulesDto {
  initialLives: number;
  lifeResetThresholds: number[];
  survivorsNeeded: number;
  handicapEnabled: boolean;
  retryAppliesHandicap: boolean;
}

export interface TaRoundResult {
  playerId: string;
  timeMs: number;
  rawTimeMs: number;
  handicapSeconds: TaHandicapSeconds;
  isRetry: boolean;
  tvNumber: number | null;
  /** Phase 3 only: the player's remaining life immediately after this round, replayed from round history. Null for phase1/phase2 (no life system). */
  livesAfter?: number | null;
  /** Phase 3 only: whether this round's outcome cost the player a life (accounts for a resolved sudden-death boundary tie). Absent for phase1/phase2. */
  lifeLost?: boolean;
}

export interface TaPhaseRound {
  id?: string;
  phase?: string;
  roundNumber: number;
  course?: string;
  results: TaRoundResult[];
  eliminatedIds: string[];
  livesReset?: boolean;
  /** Lives phase3's bottom half loses this round. Defaults to 1; only TA battle royale admins may set a different value. */
  lifeLoss?: number;
  submittedAt?: string | Date | null;
  [key: string]: unknown;
}

export interface TaPhaseLifeAdjustment {
  id: string;
  entryId: string;
  playerId: string;
  oldLives: number;
  newLives: number;
  entryVersion: number;
  adjustedByName: string;
  afterRoundId: string | null;
  afterRoundNumber: number;
  createdAt: string | Date;
}

export interface TaPhaseEntry {
  id: string;
  playerId: string;
  stage: string;
  lives: number;
  eliminated: boolean;
  rank: number | null;
  totalTime: number | null;
  taHandicapSeconds: number;
  player?: { id?: string; name?: string; nickname?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface PhaseStatus {
  phase1: { total: number; active: number; eliminated: number } | null;
  phase2: { total: number; active: number; eliminated: number } | null;
  phase3: { total: number; active: number; eliminated: number; winner: string | null } | null;
  currentPhase: string;
}

export interface TaPhaseResponse {
  phaseStatus: PhaseStatus;
  taMode: TaMode;
  taBattleRoyaleMode: boolean;
  phase3Rules: Phase3RulesDto;
  entries?: TaPhaseEntry[];
  rounds?: TaPhaseRound[];
  lifeAdjustments?: TaPhaseLifeAdjustment[];
  availableCourses?: string[];
  playedCourses?: string[];
  frozenStages?: string[];
  archived?: boolean;
}
