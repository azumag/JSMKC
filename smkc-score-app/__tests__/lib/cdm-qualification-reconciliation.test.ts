import {
  buildCdmQualificationReconciliationPlan,
  digestCdmQualificationReconciliationPlan,
  isJsmkcTournamentIdentity,
  type CdmReconciliationInput,
  type CdmReconciliationMatch,
  type CdmReconciliationMode,
} from '@/lib/cdm-qualification-reconciliation';
import { generateRoundRobinSchedule } from '@/lib/round-robin';

function emptyInput(): CdmReconciliationInput {
  return {
    bm: { qualifications: [], matches: [] },
    mr: { qualifications: [], matches: [] },
    gp: { qualifications: [], matches: [] },
  };
}

function legacyMode(
  mode: CdmReconciliationMode,
  count: number,
  group = 'A',
): CdmReconciliationInput[CdmReconciliationMode] {
  const players = Array.from({ length: count }, (_, index) => `${group}${index + 1}`);
  const qualifications = players.map((playerId, index) => ({ playerId, group, seeding: index + 1 }));
  const schedule = generateRoundRobinSchedule(players);
  const matches: CdmReconciliationMatch[] = schedule.matches.map((match, index) => ({
    id: `${mode}-${group}-${index + 1}`,
    matchNumber: index + 1,
    roundNumber: match.day,
    stage: 'qualification',
    isBye: match.isBye,
    player1Id: match.player1Id,
    player2Id: match.player2Id,
    player1Side: 1,
    player2Side: 2,
    completed: true,
    version: 4,
    ...(mode === 'bm'
      ? {
          score1: 3,
          score2: 1,
          rounds: [{ arena: 'BC1', winner: 1 }],
          player1ReportedScore1: 3,
          player1ReportedScore2: 1,
          player2ReportedScore1: 3,
          player2ReportedScore2: 1,
        }
      : mode === 'mr'
        ? {
            score1: 3,
            score2: 1,
            scoresConfirmed: true,
            assignedCourses: ['MC1', 'DP1', 'GV1', 'BC1'],
            rounds: [{ course: 'MC1', winner: 1 }],
            player1ReportedPoints1: 3,
            player1ReportedPoints2: 1,
            player1ReportedRaces: [{ course: 'MC1', winner: 1 }],
            player2ReportedPoints1: 3,
            player2ReportedPoints2: 1,
            player2ReportedRaces: [{ course: 'MC1', winner: 1 }],
          }
        : {
            points1: 30,
            points2: 15,
            cup: 'Mushroom',
            races: [{ course: 'MC1', position1: 1, position2: 2, points1: 9, points2: 6 }],
            player1ReportedPoints1: 30,
            player1ReportedPoints2: 15,
            player1ReportedRaces: [{ course: 'MC1', position1: 1, position2: 2, points1: 9, points2: 6 }],
            player2ReportedPoints1: 30,
            player2ReportedPoints2: 15,
            player2ReportedRaces: [{ course: 'MC1', position1: 1, position2: 2, points1: 9, points2: 6 }],
          }),
  }));
  return { qualifications, matches };
}

describe('CDM qualification reconciliation', () => {
  it('preserves real match IDs and reverses every side-indexed BM result when fixture orientation changes', () => {
    const input = emptyInput();
    input.bm = legacyMode('bm', 8);

    const plan = buildCdmQualificationReconciliationPlan(input);
    expect(plan.modes.bm.realMatchCount).toBe(28);
    expect(
      plan.modes.bm.retainedRows
        .filter((row) => !row.isBye)
        .map((row) => row.id)
        .sort(),
    ).toEqual(input.bm.matches.map((match) => match.id).sort());
    expect(plan.modes.bm.sideSwaps).toBeGreaterThan(0);

    const swapped = plan.modes.bm.retainedRows.find((row) => row.player1Id === 'A6' && row.player2Id === 'A3');
    expect(swapped).toMatchObject({ score1: 1, score2: 3 });
    expect(swapped?.rounds).toEqual([{ arena: 'BC1', winner: 2 }]);
    expect(swapped).toMatchObject({
      player1ReportedScore1: 1,
      player1ReportedScore2: 3,
      player2ReportedScore1: 1,
      player2ReportedScore2: 3,
    });
  });

  it('assigns the canonical MR round card while keeping score and report data', () => {
    const input = emptyInput();
    input.mr = legacyMode('mr', 8);

    const plan = buildCdmQualificationReconciliationPlan(input);
    const round1 = plan.modes.mr.retainedRows.filter((row) => row.roundNumber === 1 && !row.isBye);
    expect(round1).toHaveLength(4);
    for (const match of round1) {
      expect(match.assignedCourses).toEqual(['MC2', 'GV1', 'DP3', 'GV3']);
      expect((match.rounds as Array<{ course: string }>)[0].course).toBe('MC2');
      expect((match.player1ReportedRaces as Array<{ course: string }>)[0].course).toBe('MC2');
    }
    expect(plan.modes.mr.courseUpdates).toBe(28);
  });

  it('assigns the canonical GP cup and rewrites race course labels without changing positions or points', () => {
    const input = emptyInput();
    input.gp = legacyMode('gp', 8);

    const plan = buildCdmQualificationReconciliationPlan(input);
    const round1 = plan.modes.gp.retainedRows.filter((row) => row.roundNumber === 1 && !row.isBye);
    expect(round1).toHaveLength(4);
    for (const match of round1) {
      expect(match.cup).toBe('Star');
      const race = (match.races as Array<Record<string, unknown>>)[0];
      expect(race.course).toBe('KB1');
      expect([race.points1, race.points2].sort()).toEqual([6, 9]);
    }
  });

  it('adds only schedule BREAK rows when mapping a 14-player group through the 16P fixture', () => {
    const input = emptyInput();
    input.bm = legacyMode('bm', 14);

    const plan = buildCdmQualificationReconciliationPlan(input);
    expect(plan.modes.bm.realMatchCount).toBe(91);
    expect(plan.modes.bm.createdBreaks).toBe(29);
    expect(plan.modes.bm.deletedBreaks).toBe(0);
    expect(plan.modes.bm.targetMatchCount).toBe(120);
    expect(plan.modes.bm.retainedRows.filter((row) => !row.isBye)).toHaveLength(91);
  });

  it('rejects duplicate competitive player pairs before producing a mutation plan', () => {
    const input = emptyInput();
    input.bm = legacyMode('bm', 8);
    input.bm.matches.push({ ...input.bm.matches[0], id: 'duplicate', matchNumber: 999 });

    expect(() => buildCdmQualificationReconciliationPlan(input)).toThrow('Duplicate competitive player pair');
  });

  it('produces a deterministic digest and explicitly identifies JSMKC tournaments', async () => {
    const input = emptyInput();
    input.bm = legacyMode('bm', 8);
    const first = buildCdmQualificationReconciliationPlan(input);
    const second = buildCdmQualificationReconciliationPlan(input);

    await expect(digestCdmQualificationReconciliationPlan(first)).resolves.toBe(
      await digestCdmQualificationReconciliationPlan(second),
    );
    expect(isJsmkcTournamentIdentity({ name: 'JSMKC 2025', slug: 'jsmkc-2025' })).toBe(true);
    expect(isJsmkcTournamentIdentity({ name: 'CDM 2025 replica', slug: 'cdm-2025' })).toBe(false);
  });
});
