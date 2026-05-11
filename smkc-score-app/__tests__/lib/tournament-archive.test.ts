import {
  getArchivedFinalsPayload,
  getArchivedModePayload,
  getTournamentArchiveKeys,
  readTournamentArchive,
  TOURNAMENT_ARCHIVE_SCHEMA_VERSION,
  type TournamentArchiveBundle,
} from "@/lib/tournament-archive";
import { COURSES } from "@/lib/constants";

const objects = new Map<string, unknown>();

jest.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      ARCHIVE_BUCKET: {
        get: jest.fn(async (key: string) => {
          if (!objects.has(key)) return null;
          return { json: async () => objects.get(key) };
        }),
        put: jest.fn(async (key: string, value: string) => {
          objects.set(key, JSON.parse(value));
        }),
      },
    },
  }),
}));

function makeArchive(overrides: Partial<TournamentArchiveBundle> = {}): TournamentArchiveBundle {
  return {
    schemaVersion: TOURNAMENT_ARCHIVE_SCHEMA_VERSION,
    generatedAt: "2026-05-07T00:00:00.000Z",
    tournament: {
      id: "tournament-1",
      slug: "jsmkc2026",
      name: "JSMKC 2026",
      date: "2026-05-07T00:00:00.000Z",
      status: "completed",
      publicModes: ["ta", "bm", "mr", "gp", "overall"],
      frozenStages: [],
      taPlayerSelfEdit: true,
      bmQualificationConfirmed: true,
      mrQualificationConfirmed: true,
      gpQualificationConfirmed: true,
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
    },
    allPlayers: [],
    modes: {
      ta: {
        entries: [],
        phaseRounds: [],
        courses: COURSES,
        qualificationRegistrationLocked: true,
        qualificationEditingLockedForPlayers: true,
        frozenStages: [],
        taPlayerSelfEdit: true,
      },
      bm: { qualifications: [], matches: [], qualificationConfirmed: true },
      mr: { qualifications: [], matches: [], qualificationConfirmed: true },
      gp: { qualifications: [], matches: [], qualificationConfirmed: true },
    },
    overallRanking: {
      tournamentId: "tournament-1",
      tournamentName: "JSMKC 2026",
      lastUpdated: "2026-05-07T00:00:00.000Z",
      rankings: [],
    },
    archived: true,
    ...overrides,
  };
}

describe("tournament archive", () => {
  beforeEach(() => {
    objects.clear();
  });

  it("stores latest archive keys by id and slug", () => {
    expect(getTournamentArchiveKeys({ id: "tournament-1", slug: "jsmkc2026" })).toEqual([
      "archives/by-id/tournament-1/latest.json",
      "archives/by-slug/jsmkc2026/latest.json",
    ]);
  });

  it("can read an archive by slug when the schema version is supported", async () => {
    const archive = makeArchive();
    objects.set("archives/by-slug/jsmkc2026/latest.json", archive);

    await expect(readTournamentArchive("jsmkc2026")).resolves.toEqual(archive);
  });

  it("ignores unsupported archive shapes", async () => {
    objects.set("archives/by-id/tournament-1/latest.json", {
      schemaVersion: 999,
      tournament: {},
      modes: {},
    });

    await expect(readTournamentArchive("tournament-1")).resolves.toBeNull();
  });

  it("filters typed archived qualification matches without runtime stage casts", () => {
    type BMArchiveMatch = NonNullable<TournamentArchiveBundle["modes"]["bm"]["matches"]>[number];
    const qualificationMatch = {
      id: "bm-match-q",
      tournamentId: "tournament-1",
      matchNumber: 1,
      stage: "qualification",
      round: null,
      tvNumber: null,
      roundNumber: null,
      isBye: false,
      player1Id: "player-1",
      player1Side: 1,
      player2Id: "player-2",
      player2Side: 2,
      score1: 4,
      score2: 0,
      completed: true,
      assignedCourses: null,
      rounds: null,
      startingCourseNumber: null,
      bracket: null,
      bracketPosition: null,
      losses: 0,
      isGrandFinal: false,
      player1ReportedScore1: null,
      player1ReportedScore2: null,
      player2ReportedScore1: null,
      player2ReportedScore2: null,
      deletedAt: null,
      version: 0,
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
      player1: { id: "player-1", name: "Player 1", nickname: "p1", country: null, noCamera: false },
      player2: { id: "player-2", name: "Player 2", nickname: "p2", country: null, noCamera: false },
    } as unknown as BMArchiveMatch;
    const finalsMatch = {
      ...qualificationMatch,
      id: "bm-match-f",
      matchNumber: 2,
      stage: "finals",
      round: "winners_final",
    } as unknown as BMArchiveMatch;

    const archive = makeArchive({
      modes: {
        ...makeArchive().modes,
        bm: { qualifications: [], matches: [qualificationMatch, finalsMatch], qualificationConfirmed: true },
      },
    });

    const payload = getArchivedModePayload(archive, "bm");

    const matches = payload.matches ?? [];
    expect(matches).toHaveLength(1);
    expect(matches[0].stage).toBe("qualification");
    expect(matches[0].player1.name).toBe("Player 1");
  });

  it("groups typed archived finals matches by round prefix", () => {
    type BMArchiveMatch = NonNullable<TournamentArchiveBundle["modes"]["bm"]["matches"]>[number];
    const baseMatch = {
      id: "bm-match-f",
      tournamentId: "tournament-1",
      matchNumber: 1,
      stage: "finals",
      round: "winners_final",
      tvNumber: null,
      roundNumber: null,
      isBye: false,
      player1Id: "player-1",
      player1Side: 1,
      player2Id: "player-2",
      player2Side: 2,
      score1: 4,
      score2: 2,
      completed: true,
      assignedCourses: null,
      rounds: null,
      startingCourseNumber: null,
      bracket: "winners",
      bracketPosition: null,
      losses: 0,
      isGrandFinal: false,
      player1ReportedScore1: null,
      player1ReportedScore2: null,
      player2ReportedScore1: null,
      player2ReportedScore2: null,
      deletedAt: null,
      version: 0,
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
      player1: { id: "player-1", name: "Player 1", nickname: "p1", country: null, noCamera: false },
      player2: { id: "player-2", name: "Player 2", nickname: "p2", country: null, noCamera: false },
    } as unknown as BMArchiveMatch;
    const archive = makeArchive({
      modes: {
        ...makeArchive().modes,
        bm: {
          qualifications: [],
          matches: [
            baseMatch,
            { ...baseMatch, id: "bm-match-l", matchNumber: 2, round: "losers_final" },
            { ...baseMatch, id: "bm-match-g", matchNumber: 3, round: "grand_final_reset" },
          ],
          qualificationConfirmed: true,
        },
      },
    });

    const payload = getArchivedFinalsPayload(archive, "bm", "grouped") as {
      winnersMatches: unknown[];
      losersMatches: unknown[];
      grandFinalMatches: unknown[];
    };

    expect(payload.winnersMatches).toHaveLength(1);
    expect(payload.losersMatches).toHaveLength(1);
    expect(payload.grandFinalMatches).toHaveLength(1);
  });
});
