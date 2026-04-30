import prisma from "@/lib/prisma";
import { reflectQualificationMatchBroadcast } from "@/lib/overlay/broadcast-state";

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    tournament: {
      update: jest.fn(),
    },
  },
}));

describe("reflectQualificationMatchBroadcast", () => {
  const logger = { warn: jest.fn() } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.tournament.update as jest.Mock).mockResolvedValue({});
  });

  it("updates the broadcast footer state for completed qualification matches", async () => {
    await reflectQualificationMatchBroadcast(logger, {
      tournamentId: "t1",
      matchId: "m1",
      matchNumber: 7,
      stage: "qualification",
      player1Name: "Alice",
      player2Name: "Bob",
      score1: 3,
      score2: 1,
    });

    expect(prisma.tournament.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        overlayPlayer1Name: "Alice",
        overlayPlayer2Name: "Bob",
        overlayMatchLabel: "Qualification Match #7",
        overlayPlayer1Wins: 3,
        overlayPlayer2Wins: 1,
        overlayMatchFt: null,
      },
    });
  });

  it("does not overwrite the footer for non-qualification matches", async () => {
    await reflectQualificationMatchBroadcast(logger, {
      tournamentId: "t1",
      matchId: "m1",
      matchNumber: 7,
      stage: "finals",
      player1Name: "Alice",
      player2Name: "Bob",
      score1: 3,
      score2: 1,
    });

    expect(prisma.tournament.update).not.toHaveBeenCalled();
  });
});
