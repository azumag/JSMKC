from pathlib import Path
import re

ROOT = Path("smkc-score-app")


def replace_exact(path: Path, old: str, new: str, label: str, count: int = 1) -> None:
    source = path.read_text()
    actual = source.count(old)
    if actual != count:
        raise SystemExit(f"{label}: expected {count} occurrence(s), found {actual}")
    path.write_text(source.replace(old, new, count))


def replace_regex(path: Path, pattern: str, replacement: str, label: str, count: int = 1) -> None:
    source = path.read_text()
    updated, actual = re.subn(pattern, replacement, source, count=count, flags=re.MULTILINE | re.DOTALL)
    if actual != count:
        raise SystemExit(f"{label}: expected {count} occurrence(s), found {actual}")
    path.write_text(updated)


route = ROOT / "src/lib/api-factories/qualification-route.ts"
replace_exact(
    route,
    "const SUPPORTED_QUALIFICATION_GROUPS = ['A', 'B', 'C'] as const;\n",
    """const SUPPORTED_QUALIFICATION_GROUPS = ['A', 'B', 'C'] as const;

/**
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
""",
    "schedule fallback helper",
)

replace_regex(
    route,
    r"      /\* Read and validate every generated schedule before destructive writes\..*?^      /\*\n       \* Delete existing qualification records and matches first to avoid",
    """      /* Read and validate every generated schedule before destructive writes.
       * Existing historical tournaments keep their persisted setting. New
       * tournaments are configured as CDM, with a per-group circle fallback
       * for 13 or fewer players (and for groups above the workbook ceiling). */
      const tournament = await resolveTournament(id, { id: true, qualificationScheduleMethod: true });
      if (!tournament) return createErrorResponse('Tournament not found', 404);
      const configuredScheduleMethod: QualificationScheduleMethod =
        tournament.qualificationScheduleMethod === 'cdm' ? 'cdm' : 'circle';
      const groups = [...new Set(players.map((p: { group: string }) => p.group))];
      const schedules = new Map<string, ReturnType<typeof generateRoundRobinSchedule>>();
      const scheduleMethodsByGroup = new Map<string, QualificationScheduleMethod>();

      for (const group of groups) {
        const groupPlayers = players
          .filter((p: { group: string }) => p.group === group)
          .sort(
            (a: { seeding?: number }, b: { seeding?: number }) => (a.seeding ?? Infinity) - (b.seeding ?? Infinity),
          );
        const groupScheduleMethod = resolveQualificationScheduleMethodForGroup(
          configuredScheduleMethod,
          groupPlayers.length,
        );
        scheduleMethodsByGroup.set(group, groupScheduleMethod);

        if (groupScheduleMethod === 'cdm') {
          const seeds = groupPlayers.map((player: { seeding?: number }) => player.seeding);
          if (
            seeds.some((seed) => !Number.isInteger(seed) || (seed as number) < 1) ||
            new Set(seeds).size !== seeds.length
          ) {
            return createErrorResponse(
              'CDM scheduling requires each group to have unique positive integer seeds',
              400,
              'INVALID_CDM_SEED_ORDER',
            );
          }
        }

        schedules.set(
          group,
          generateRoundRobinSchedule(
            groupPlayers.map((p: { playerId: string }) => p.playerId),
            { method: groupScheduleMethod },
          ),
        );
      }

      /* Validate fixed MR/GP cards only for groups that actually use the CDM
       * workbook. Circle-fallback groups continue to use their generated deck. */
      if (config.assignCoursesRandomly || config.assignCupRandomly) {
        for (const group of groups) {
          if (scheduleMethodsByGroup.get(group) !== 'cdm') continue;
          const schedule = schedules.get(group)!;
          for (const match of schedule.matches) {
            if (!match.isBye) getCdmQualificationRoundFixture(match.day);
          }
        }
      }

      /*
       * Delete existing qualification records and matches first to avoid""",
    "per-group schedule generation",
)

replace_exact(
    route,
    """      const shuffledCourses =
        config.assignCoursesRandomly && scheduleMethod === 'circle' ? generateShuffledCourseList() : null;
""",
    """      const hasCircleSchedule = [...scheduleMethodsByGroup.values()].includes('circle');
      const shuffledCourses =
        config.assignCoursesRandomly && hasCircleSchedule ? generateShuffledCourseList() : null;
""",
    "mixed MR course deck",
)
replace_exact(
    route,
    """      const shuffledCups =
        config.assignCupRandomly && config.cupList && scheduleMethod === 'circle'
          ? generateShuffledCupList(config.cupList, logger)
          : null;
""",
    """      const shuffledCups =
        config.assignCupRandomly && config.cupList && hasCircleSchedule
          ? generateShuffledCupList(config.cupList, logger)
          : null;
""",
    "mixed GP cup deck",
)
replace_exact(
    route,
    """        const schedule = schedules.get(group)!;

        for (const m of schedule.matches) {
""",
    """        const schedule = schedules.get(group)!;
        const groupScheduleMethod = scheduleMethodsByGroup.get(group) ?? 'circle';

        for (const m of schedule.matches) {
""",
    "group schedule method in match loop",
)
replace_exact(
    route,
    """          const cdmRoundFixture =
            scheduleMethod === 'cdm' &&
""",
    """          const cdmRoundFixture =
            groupScheduleMethod === 'cdm' &&
""",
    "group-scoped CDM cards",
)
replace_exact(
    route,
    """            details: { mode: 'qualification', playerCount: players.length },
""",
    """            details: {
              mode: 'qualification',
              playerCount: players.length,
              scheduleMethodsByGroup: Object.fromEntries(scheduleMethodsByGroup),
            },
""",
    "schedule policy audit details",
)


test = ROOT / "__tests__/lib/api-factories/qualification-route.test.ts"
replace_exact(
    test,
    """  MR_QUALIFICATION_COURSE_DECK_REPEATS,
} from '@/lib/api-factories/qualification-route';
""",
    """  MR_QUALIFICATION_COURSE_DECK_REPEATS,
  resolveQualificationScheduleMethodForGroup,
} from '@/lib/api-factories/qualification-route';
""",
    "test helper import",
)

replacement_tests = r'''    it('uses circle fallback for 13-player groups and CDM for 14-player groups in the same tournament', async () => {
      const groupA = Array.from({ length: 14 }, (_, index) => ({
        playerId: `a-${index + 1}`,
        group: 'A',
        seeding: index + 1,
      }));
      const groupB = Array.from({ length: 13 }, (_, index) => ({
        playerId: `b-${index + 1}`,
        group: 'B',
        seeding: index + 1,
      }));
      const players = [...groupA, ...groupB];
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({
        id: 'tournament-123',
        qualificationScheduleMethod: 'cdm',
      });
      (prisma.mRQualification as any).createMany.mockResolvedValue({ count: 24 });
      (prisma.mRQualification as any).findMany.mockResolvedValue([]);
      (prisma.mRMatch as any).findMany.mockResolvedValue([]);
      (prisma as any).$executeRawUnsafe.mockResolvedValue(211);

      const random = jest.spyOn(Math, 'random').mockReturnValue(0);
      try {
        const mr = createQualificationHandlers(
          createMockConfig({
            eventTypeCode: 'mr',
            matchModel: 'mRMatch',
            qualificationModel: 'mRQualification',
            assignCoursesRandomly: true,
          }),
        );
        const response = await mr.POST(
          new NextRequest('http://localhost:3000', { method: 'POST', body: JSON.stringify({ players }) }),
          { params: Promise.resolve({ id: 'tournament-123' }) },
        );

        expect(response.status).toBe(201);
        const rows = JSON.parse((prisma as any).$executeRawUnsafe.mock.calls[0][1]);
        const cdmRows = rows.slice(0, 120);
        const circleRows = rows.slice(120);
        expect(cdmRows).toHaveLength(120);
        expect(circleRows).toHaveLength(91);
        expect(cdmRows.filter((row: any) => row.isBye)).toHaveLength(29);
        expect(circleRows.filter((row: any) => row.isBye)).toHaveLength(13);

        const circleDeck = generateShuffledCourseList();
        for (const roundNumber of [1, 2, 3]) {
          const cdmExpected = [...CDM_QUALIFICATION_ROUND_FIXTURES[roundNumber - 1].courses];
          const circleExpected = getAssignedCoursesForRound(circleDeck, roundNumber);
          const cdmRoundRows = cdmRows.filter((row: any) => !row.isBye && row.roundNumber === roundNumber);
          const circleRoundRows = circleRows.filter((row: any) => !row.isBye && row.roundNumber === roundNumber);
          cdmRoundRows.forEach((row: any) => expect(row.assignedCourses).toEqual(cdmExpected));
          circleRoundRows.forEach((row: any) => expect(row.assignedCourses).toEqual(circleExpected));
        }
      } finally {
        random.mockRestore();
      }
    });

    it('uses the shared CDM fixture for MR courses and GP cups for 14+ player groups', async () => {
      const players = Array.from({ length: 16 }, (_, i) => ({
        playerId: `player-${i + 1}`,
        group: 'A',
        seeding: i + 1,
      }));
      (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({
        id: 'tournament-123',
        qualificationScheduleMethod: 'cdm',
      });
      (prisma.mRQualification as any).createMany.mockResolvedValue({ count: 16 });
      (prisma.mRQualification as any).findMany.mockResolvedValue([]);
      (prisma.mRMatch as any).findMany.mockResolvedValue([]);
      (prisma.gPQualification as any).createMany.mockResolvedValue({ count: 16 });
      (prisma.gPQualification as any).findMany.mockResolvedValue([]);
      (prisma.gPMatch as any).findMany.mockResolvedValue([]);
      (prisma as any).$executeRawUnsafe.mockResolvedValue(120);

      const mr = createQualificationHandlers(
        createMockConfig({
          eventTypeCode: 'mr',
          matchModel: 'mRMatch',
          qualificationModel: 'mRQualification',
          assignCoursesRandomly: true,
        }),
      );
      const gp = createQualificationHandlers(
        createMockConfig({
          eventTypeCode: 'gp',
          matchModel: 'gPMatch',
          qualificationModel: 'gPQualification',
          assignCupRandomly: true,
          cupList: ['Mushroom', 'Flower', 'Star', 'Special'],
        }),
      );
      const request = () =>
        new NextRequest('http://localhost:3000', { method: 'POST', body: JSON.stringify({ players }) });

      expect((await mr.POST(request(), { params: Promise.resolve({ id: 'tournament-123' }) })).status).toBe(201);
      const mrRows = JSON.parse((prisma as any).$executeRawUnsafe.mock.calls[0][1]);
      expect(mrRows.filter((row: any) => row.roundNumber === 1).map((row: any) => row.assignedCourses)).toEqual(
        Array(8).fill([...CDM_QUALIFICATION_ROUND_FIXTURES[0].courses]),
      );

      expect((await gp.POST(request(), { params: Promise.resolve({ id: 'tournament-123' }) })).status).toBe(201);
      const gpRows = JSON.parse((prisma as any).$executeRawUnsafe.mock.calls[1][1]);
      expect(gpRows.filter((row: any) => row.roundNumber === 1).map((row: any) => row.cup)).toEqual(
        Array(8).fill(CDM_QUALIFICATION_ROUND_FIXTURES[0].cup),
      );
    });

    it('resolves the automatic group-size boundary without exposing a UI choice', () => {
      expect(resolveQualificationScheduleMethodForGroup('circle', 20)).toBe('circle');
      expect(resolveQualificationScheduleMethodForGroup('cdm', 2)).toBe('circle');
      expect(resolveQualificationScheduleMethodForGroup('cdm', 13)).toBe('circle');
      expect(resolveQualificationScheduleMethodForGroup('cdm', 14)).toBe('cdm');
      expect(resolveQualificationScheduleMethodForGroup('cdm', 20)).toBe('cdm');
      expect(resolveQualificationScheduleMethodForGroup('cdm', 21)).toBe('circle');
    });

'''
replace_regex(
    test,
    r"    it\('uses the shared CDM fixture for MR courses and GP cups immediately after setup', async \(\) => \{.*?^    \}\);\n\n(?=    it\('should fail explicitly)",
    replacement_tests,
    "qualification fallback tests",
)

package_json = ROOT / "package.json"
replace_exact(
    package_json,
    '    "postcss": "^8.5.14",\n',
    '    "postcss": "^8.5.18",\n',
    "postcss security override",
)

print("Applied PR 3053 group-size fallback and audit fix")
