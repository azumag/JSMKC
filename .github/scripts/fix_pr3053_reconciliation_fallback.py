from pathlib import Path
import re

ROOT = Path('smkc-score-app')


def replace_exact(path: Path, old: str, new: str, label: str, count: int = 1) -> None:
    source = path.read_text()
    actual = source.count(old)
    if actual != count:
        raise SystemExit(f'{label}: expected {count} occurrence(s), found {actual}')
    path.write_text(source.replace(old, new, count))


# Use one shared schedule policy in live setup and archive reconciliation.
route = ROOT / 'src/lib/api-factories/qualification-route.ts'
replace_exact(
    route,
    "import { getCdmQualificationRoundFixture } from '@/lib/cdm-qualification-round-fixtures';\n",
    """import { getCdmQualificationRoundFixture } from '@/lib/cdm-qualification-round-fixtures';
import { resolveQualificationScheduleMethodForGroup } from '@/lib/qualification-schedule-policy';

export { resolveQualificationScheduleMethodForGroup };
""",
    'qualification route policy import',
)
helper = """/**
 * New tournaments are CDM-first, but the workbook fixture is only used for
 * normal championship-sized groups. Groups of 13 or fewer intentionally keep
 * the flexible legacy circle schedule; groups above the 20-player workbook
 * ceiling also fall back defensively instead of becoming impossible to set up.
 */
export function resolveQualificationScheduleMethodForGroup(
  configuredMethod: QualificationScheduleMethod,
  playerCount: number,
): QualificationScheduleMethod {
  if (configuredMethod !== 'cdm') return 'circle';
  return playerCount >= 14 && playerCount <= 20 ? 'cdm' : 'circle';
}

"""
replace_exact(route, helper, '', 'remove duplicate schedule policy helper')

reconciliation = ROOT / 'src/lib/cdm-qualification-reconciliation.ts'
replace_exact(
    reconciliation,
    "import { GROUPS } from '@/lib/group-utils';\n",
    """import { GROUPS } from '@/lib/group-utils';
import { resolveQualificationScheduleMethodForGroup } from '@/lib/qualification-schedule-policy';
""",
    'reconciliation policy import',
)
replace_exact(
    reconciliation,
    """  targetPlayer1Id: string,
  targetPlayer2Id: string,
): { row: CdmReconciliationRow; swapped: boolean; courseChanged: boolean; cupChanged: boolean } {
""",
    """  targetPlayer1Id: string,
  targetPlayer2Id: string,
  useCdmRoundCard: boolean,
): { row: CdmReconciliationRow; swapped: boolean; courseChanged: boolean; cupChanged: boolean } {
""",
    'orientRealMatch policy parameter',
)
replace_exact(
    reconciliation,
    """  if (mode === 'mr') {
    const fixture = getCdmQualificationRoundFixture(roundNumber);
""",
    """  if (useCdmRoundCard && mode === 'mr') {
    const fixture = getCdmQualificationRoundFixture(roundNumber);
""",
    'MR fixed card guard',
)
replace_exact(
    reconciliation,
    """  } else if (mode === 'gp') {
    const fixture = getCdmQualificationRoundFixture(roundNumber);
""",
    """  } else if (useCdmRoundCard && mode === 'gp') {
    const fixture = getCdmQualificationRoundFixture(roundNumber);
""",
    'GP fixed card guard',
)
replace_exact(
    reconciliation,
    """  for (const group of orderedGroups) {
    const players = groups.get(group)!.map((entry) => entry.playerId);
    let schedule;
    try {
      schedule = generateRoundRobinSchedule(players, { method: 'cdm' });
""",
    """  for (const group of orderedGroups) {
    const players = groups.get(group)!.map((entry) => entry.playerId);
    const groupScheduleMethod = resolveQualificationScheduleMethodForGroup('cdm', players.length);
    let schedule;
    try {
      schedule = generateRoundRobinSchedule(players, { method: groupScheduleMethod });
""",
    'reconciliation group policy',
)
replace_exact(
    reconciliation,
    """          target.player1Id,
          target.player2Id,
        );
""",
    """          target.player1Id,
          target.player2Id,
          groupScheduleMethod === 'cdm',
        );
""",
    'orientRealMatch group policy argument',
)
replace_exact(
    reconciliation,
    "'A CDM fixture pair has no existing competitive match'",
    "'A target schedule pair has no existing competitive match'",
    'generic missing pair message',
)
replace_exact(
    reconciliation,
    "'Existing competitive matches are not present in the CDM fixture'",
    "'Existing competitive matches are not present in the target schedule'",
    'generic extra pair message',
)

# Cover the real A14/B13 archive-reconciliation scenario. The 13-player group
# must retain its legacy MR cards while its global match numbers move after the
# expanded 14-player CDM fixture.
test = ROOT / '__tests__/lib/cdm-qualification-reconciliation.test.ts'
anchor = """  it('adds only schedule BREAK rows when mapping a 14-player group through the 16P fixture', () => {
"""
new_test = """  it('reconciles A14 with CDM while keeping B13 on the circle fallback in the same archive', () => {
    const groupA = legacyMode('mr', 14, 'A');
    const groupB = legacyMode('mr', 13, 'B');
    const groupBOffset = groupA.matches.length;
    const input = emptyInput();
    input.mr = {
      qualifications: [...groupA.qualifications, ...groupB.qualifications],
      matches: [
        ...groupA.matches,
        ...groupB.matches.map((match) => ({
          ...match,
          matchNumber: match.matchNumber + groupBOffset,
        })),
      ],
    };

    const plan = buildCdmQualificationReconciliationPlan(input);
    const groupAReal = plan.modes.mr.retainedRows.filter((row) => row.group === 'A' && !row.isBye);
    const groupBReal = plan.modes.mr.retainedRows.filter((row) => row.group === 'B' && !row.isBye);

    expect(plan.modes.mr.targetMatchCount).toBe(211);
    expect(plan.modes.mr.realMatchCount).toBe(169);
    expect(groupAReal).toHaveLength(91);
    expect(groupBReal).toHaveLength(78);
    expect(Math.min(...groupBReal.map((row) => row.matchNumber))).toBeGreaterThan(120);

    for (const row of groupBReal) {
      expect(row.assignedCourses).toEqual(['MC1', 'DP1', 'GV1', 'BC1']);
      expect((row.rounds as Array<{ course: string }>)[0].course).toBe('MC1');
      expect((row.player1ReportedRaces as Array<{ course: string }>)[0].course).toBe('MC1');
    }

    expect(
      plan.modes.mr.retainedRows
        .filter((row) => !row.isBye)
        .map((row) => row.id)
        .sort(),
    ).toEqual(input.mr.matches.filter((row) => !row.isBye).map((row) => row.id).sort());
  });

"""
replace_exact(test, anchor, new_test + anchor, 'mixed archive reconciliation test')

print('Applied shared schedule policy to archive reconciliation')
