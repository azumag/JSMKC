import { CUPS, DRIVER_POINTS } from '@/lib/constants';

type GpCupResultInput = {
  cup?: unknown;
  points1?: unknown;
  points2?: unknown;
  races?: unknown;
};

const MAX_GP_CUP_RESULTS = 20;

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isUnsafeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value);
}

function sumRacePoints(races: unknown, side: 1 | 2): number | null {
  if (!Array.isArray(races)) return null;
  let total = 0;

  for (const race of races) {
    if (!race || typeof race !== 'object') return null;
    const entry = race as Record<string, unknown>;
    const existing = entry[side === 1 ? 'points1' : 'points2'];

    if (isUnsafeInteger(existing)) return null;
    if (isNonNegativeSafeInteger(existing)) {
      total += existing;
      if (!Number.isSafeInteger(total)) return null;
      continue;
    }

    const position = entry[side === 1 ? 'position1' : 'position2'];
    if (!Number.isInteger(position)) return null;
    total += DRIVER_POINTS[Number(position)] ?? 0;
  }

  return total;
}

export function normalizeGpFinalsCupResults(input: unknown): {
  results?: Array<Record<string, unknown>>;
  error?: string;
} {
  if (!Array.isArray(input) || input.length === 0) {
    return { error: 'cupResults must be a non-empty array' };
  }
  if (input.length > MAX_GP_CUP_RESULTS) {
    return { error: `cupResults must not exceed ${MAX_GP_CUP_RESULTS} entries` };
  }

  const results: Array<Record<string, unknown>> = [];
  for (let index = 0; index < input.length; index++) {
    const raw = input[index] as GpCupResultInput;
    if (!raw || typeof raw !== 'object') {
      return { error: `cupResults[${index}] must be an object` };
    }

    if (isUnsafeInteger(raw.points1) || isUnsafeInteger(raw.points2)) {
      return { error: `cupResults[${index}] requires non-negative integer points` };
    }

    const fallbackCup = CUPS[index % CUPS.length];
    const hasExplicitCup = raw.cup !== undefined;
    if (hasExplicitCup && (typeof raw.cup !== 'string' || !CUPS.includes(raw.cup as (typeof CUPS)[number]))) {
      return { error: `cupResults[${index}].cup must be a valid cup` };
    }
    const cup = hasExplicitCup ? (raw.cup as (typeof CUPS)[number]) : fallbackCup;
    const racePoints1 = sumRacePoints(raw.races, 1);
    const racePoints2 = sumRacePoints(raw.races, 2);
    const points1 = isNonNegativeSafeInteger(raw.points1) ? raw.points1 : racePoints1;
    const points2 = isNonNegativeSafeInteger(raw.points2) ? raw.points2 : racePoints2;

    if (
      points1 === null ||
      points2 === null ||
      !Number.isSafeInteger(points1) ||
      !Number.isSafeInteger(points2) ||
      points1 < 0 ||
      points2 < 0
    ) {
      return { error: `cupResults[${index}] requires non-negative integer points` };
    }

    results.push({
      cup,
      points1,
      points2,
      winner: points1 > points2 ? 1 : points2 > points1 ? 2 : null,
      ...(Array.isArray(raw.races) ? { races: raw.races } : {}),
    });
  }

  return { results };
}
