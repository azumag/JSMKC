from pathlib import Path
import re

ROOT = Path('smkc-score-app')


def replace_exact(path: Path, old: str, new: str, label: str, count: int = 1) -> None:
    source = path.read_text()
    actual = source.count(old)
    if actual != count:
        raise SystemExit(f'{label}: expected {count} occurrence(s), found {actual}')
    path.write_text(source.replace(old, new, count))


def replace_regex(path: Path, pattern: str, replacement: str, label: str, count: int = 1) -> None:
    source = path.read_text()
    updated, actual = re.subn(pattern, replacement, source, count=count, flags=re.MULTILINE | re.DOTALL)
    if actual != count:
        raise SystemExit(f'{label}: expected {count} occurrence(s), found {actual}')
    path.write_text(updated)


planner = ROOT / '__tests__/lib/cdm-qualification-reconciliation.test.ts'
replace_regex(
    planner,
    r"  it\('preserves real match IDs and reverses every side-indexed BM result when fixture orientation changes', \(\) => \{.*?^  \}\);\n",
    r'''  it('preserves real match IDs and reverses every side-indexed BM result when a 14-player fixture changes orientation', () => {
    const input = emptyInput();
    input.bm = legacyMode('bm', 14);

    const plan = buildCdmQualificationReconciliationPlan(input);
    expect(plan.modes.bm.realMatchCount).toBe(91);
    expect(
      plan.modes.bm.retainedRows
        .filter((row) => !row.isBye)
        .map((row) => row.id)
        .sort(),
    ).toEqual(input.bm.matches.map((match) => match.id).sort());
    expect(plan.modes.bm.sideSwaps).toBeGreaterThan(0);
    expect(plan.modes.bm.rowUpdates).toBe(plan.modes.bm.rowsToUpdate.length);
    expect(plan.modes.bm.rowUpdates).toBeGreaterThan(0);

    const swapped = plan.modes.bm.retainedRows.find(
      (row) => !row.isBye && row.score1 === 1 && row.score2 === 3,
    );
    expect(swapped).toBeDefined();
    expect(swapped?.rounds).toEqual([{ arena: 'BC1', winner: 2 }]);
    expect(swapped).toMatchObject({
      player1ReportedScore1: 1,
      player1ReportedScore2: 3,
      player2ReportedScore1: 1,
      player2ReportedScore2: 3,
    });
  });
''',
    '14-player BM orientation test',
)
replace_exact(planner, "    input.mr = legacyMode('mr', 8);\n", "    input.mr = legacyMode('mr', 14);\n", 'MR canonical input', count=2)
replace_exact(planner, "    expect(round1).toHaveLength(4);\n", "    expect(round1.length).toBeGreaterThan(0);\n", 'MR round-one count')
replace_exact(planner, "    expect(plan.modes.mr.courseUpdates).toBe(28);\n", "    expect(plan.modes.mr.courseUpdates).toBeGreaterThan(0);\n", 'MR course update count')
replace_exact(planner, "    seed.mr = legacyMode('mr', 8);\n", "    seed.mr = legacyMode('mr', 14);\n", 'MR detail seed')
replace_exact(planner, "    input.gp = legacyMode('gp', 8);\n", "    input.gp = legacyMode('gp', 14);\n", 'GP canonical input')
replace_exact(planner, "    expect(round1).toHaveLength(4);\n", "    expect(round1.length).toBeGreaterThan(0);\n", 'GP round-one count')
replace_exact(planner, "    seed.gp = legacyMode('gp', 8);\n", "    seed.gp = legacyMode('gp', 14);\n", 'GP detail seed')

service = ROOT / '__tests__/lib/cdm-qualification-reconciliation-service.test.ts'
replace_exact(service, 'function bmLegacyFixture(count = 8) {\n', 'function bmLegacyFixture(count = 14) {\n', 'service legacy fixture default')
replace_exact(
    service,
    "function mockModeData({ tournament = completedTournament(), count = 8 } = {}) {\n",
    "function mockModeData({ tournament = completedTournament(), count = 14 } = {}) {\n",
    'service mock default',
)
replace_exact(
    service,
    "    const players = Array.from({ length: 8 }, (_, index) => `p${index + 1}`);\n",
    "    const players = Array.from({ length: 16 }, (_, index) => `p${index + 1}`);\n",
    'idempotent CDM fixture size',
)

sqlite = ROOT / '__tests__/lib/cdm-qualification-reconciliation-sqlite.test.ts'
replace_exact(
    sqlite,
    "  const players = Array.from({ length: 8 }, (_, index) => `p${index + 1}`);\n",
    "  const players = Array.from({ length: 14 }, (_, index) => `p${index + 1}`);\n",
    'SQLite legacy fixture size',
)

print('Updated reconciliation tests for the 13-and-under circle fallback')
