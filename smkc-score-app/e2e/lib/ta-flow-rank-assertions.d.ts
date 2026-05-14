export interface TaFlowRoundData {
  eliminatedIds?: readonly unknown[] | null;
}

export type TaFlowRound = TaFlowRoundData | null | undefined;

export interface TaFlowEntry {
  playerId?: string;
  rank?: number;
}

export interface TaFlowRankScore {
  playerId?: string;
  taFinalsPoints?: number | null;
}

export interface TaFlowRankResponseBody {
  data?: {
    scores?: TaFlowRankScore[];
  };
  scores?: TaFlowRankScore[];
}

export interface TaFlowRankAssertionInput {
  entries: readonly TaFlowEntry[];
  phase3Status?: number;
  phase3Rounds?: readonly TaFlowRound[] | null;
  recalcStatus: number;
  recalcBody?: TaFlowRankResponseBody | null;
}

export interface TaFlowRankAssertionResult {
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
}

/*
 * These declarations intentionally mirror the CommonJS helper instead of
 * rewriting the runner to TypeScript.  The E2E scripts still execute directly
 * with Node, while TypeScript unit tests get a stable contract for the helper
 * boundary that consumes partially trusted API JSON.
 */
export function collectEliminationOrder(rounds?: readonly TaFlowRound[] | null): string[];

export function evaluateTaFlowRankAssertion(input: TaFlowRankAssertionInput): TaFlowRankAssertionResult;
