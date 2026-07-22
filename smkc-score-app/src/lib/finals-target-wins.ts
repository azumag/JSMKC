export interface FinalsTargetContext {
  round?: string | null;
  stage?: string | null;
  /** Stored per-match first-to value. Null is the legacy round-derived rule. */
  targetWins?: number | null;
}

function storedTargetWins(context?: FinalsTargetContext): number | null {
  return typeof context?.targetWins === 'number' && Number.isInteger(context.targetWins) && context.targetWins > 0
    ? context.targetWins
    : null;
}

function isEarlyUpperRound(round?: string | null): boolean {
  return round === 'winners_r1' || round === 'winners_qf';
}

function isEarlyLowerRound(round?: string | null): boolean {
  return round === 'losers_r1' || round === 'losers_r2';
}

function isMidLowerRound(round?: string | null): boolean {
  return round === 'losers_r3' || round === 'losers_r4';
}

function isTopFourTargetRound(round?: string | null): boolean {
  return (
    round === 'winners_final' ||
    round === 'losers_sf' ||
    round === 'losers_final' ||
    round === 'grand_final' ||
    round === 'grand_final_reset'
  );
}

export function getBmFinalsTargetWins(context?: FinalsTargetContext): number {
  const stored = storedTargetWins(context);
  if (stored !== null) return stored;
  if (context?.stage === 'playoff') {
    return context.round === 'playoff_r2' ? 4 : 3;
  }
  if (isEarlyUpperRound(context?.round) || isEarlyLowerRound(context?.round)) {
    return 5;
  }
  if (context?.round === 'winners_sf' || isMidLowerRound(context?.round) || isTopFourTargetRound(context?.round)) {
    return 7;
  }
  return 5;
}

export function getMrFinalsTargetWins(context?: FinalsTargetContext): number {
  const stored = storedTargetWins(context);
  if (stored !== null) return stored;
  if (context?.stage === 'playoff') {
    return context.round === 'playoff_r2' ? 4 : 3;
  }
  if (isEarlyUpperRound(context?.round) || isEarlyLowerRound(context?.round)) {
    return 5;
  }
  if (context?.round === 'winners_sf' || isMidLowerRound(context?.round)) {
    return 7;
  }
  if (isTopFourTargetRound(context?.round)) {
    return 9;
  }
  return 5;
}

export function getGpFinalsTargetWins(context?: FinalsTargetContext): number {
  const stored = storedTargetWins(context);
  if (stored !== null) return stored;
  if (context?.stage === 'playoff') {
    return 1;
  }
  if (isTopFourTargetRound(context?.round)) {
    return 3;
  }
  return 2;
}

export function getGpFinalsMaxCups(context?: FinalsTargetContext): number {
  return getGpFinalsTargetWins(context) * 2 - 1;
}

export function getMrFinalsMaxRounds(context?: FinalsTargetContext): number {
  return getMrFinalsTargetWins(context) * 2 - 1;
}
