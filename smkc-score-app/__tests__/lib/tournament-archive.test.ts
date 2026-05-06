import {
  getTournamentArchiveKeys,
  readTournamentArchive,
  TOURNAMENT_ARCHIVE_SCHEMA_VERSION,
  type TournamentArchiveBundle,
} from "@/lib/tournament-archive";

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
        courses: [],
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
});
