export interface FinalsTargetContext {
  round?: string | null;
  stage?: string | null;
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

function isFinalRound(round?: string | null): boolean {
  return round === 'winners_final'
    || round === 'losers_sf'
    || round === 'losers_final'
    || round === 'grand_final'
    || round === 'grand_final_reset';
}

export function getBmFinalsTargetWins(context?: FinalsTargetContext): number {
  if (context?.stage === 'playoff') {
    return context.round === 'playoff_r2' ? 4 : 3;
  }
  if (isEarlyUpperRound(context?.round) || isEarlyLowerRound(context?.round)) {
    return 5;
  }
  if (context?.round === 'winners_sf' || isMidLowerRound(context?.round) || isFinalRound(context?.round)) {
    return 7;
  }
  return 5;
}

export function getMrFinalsTargetWins(context?: FinalsTargetContext): number {
  if (context?.stage === 'playoff') {
    return context.round === 'playoff_r2' ? 4 : 3;
  }
  if (isEarlyUpperRound(context?.round) || isEarlyLowerRound(context?.round)) {
    return 5;
  }
  if (context?.round === 'winners_sf' || isMidLowerRound(context?.round)) {
    return 7;
  }
  if (isFinalRound(context?.round)) {
    return 9;
  }
  return 5;
}

export function getGpFinalsTargetWins(context?: FinalsTargetContext): number {
  if (context?.stage === 'playoff') {
    return 1;
  }
  if (isFinalRound(context?.round)) {
    return 3;
  }
  return 2;
}

export function getMrFinalsMaxRounds(context?: FinalsTargetContext): number {
  return getMrFinalsTargetWins(context) * 2 - 1;
}
