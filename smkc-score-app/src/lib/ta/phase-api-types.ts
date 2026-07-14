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
  availableCourses?: string[];
  playedCourses?: string[];
  archived?: boolean;
}
