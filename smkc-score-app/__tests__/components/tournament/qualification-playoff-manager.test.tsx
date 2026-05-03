/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QualificationPlayoffManager } from "@/components/tournament/qualification-playoff-manager";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "playoffGroupTitle") return `Playoff rank ${values?.rank}`;
    if (key === "broadcastReflect") return "Broadcast";
    if (key === "saving") return "Saving";
    if (key === "recordPlayoffResult") return "Record result";
    return key;
  },
}));

describe("QualificationPlayoffManager broadcast", () => {
  it("updates the lower-frame label when broadcasting a 2P qualification playoff", async () => {
    const onBroadcast = jest.fn().mockResolvedValue(true);

    render(
      <QualificationPlayoffManager
        groups={[
          {
            id: "group-a-rank-3",
            rank: 3,
            players: [
              { id: "q1", nickname: "Mario", _autoRank: 3, rankOverride: null },
              { id: "q2", nickname: "Luigi", _autoRank: 3, rankOverride: null },
            ],
          },
        ]}
        isAdmin
        onSave={jest.fn()}
        onBroadcast={onBroadcast}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Broadcast" }));

    await waitFor(() => expect(onBroadcast).toHaveBeenCalledTimes(1));
    expect(onBroadcast).toHaveBeenCalledWith("Mario", "Luigi", {
      matchLabel: "Qualification Playoff Rank 3",
      player1Wins: null,
      player2Wins: null,
      matchFt: null,
    });
  });
});
