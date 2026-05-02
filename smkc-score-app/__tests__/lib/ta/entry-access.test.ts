import { canEditTaEntry } from "@/lib/ta/entry-access";

describe("TA entry access helper", () => {
  const entry = {
    stage: "qualification",
    playerId: "player-1",
    partnerId: "player-2",
  };

  it("allows admins to edit any unfrozen entry", () => {
    expect(canEditTaEntry(entry, { isAdmin: true })).toBe(true);
  });

  it("allows the owner to edit their own unfrozen entry", () => {
    expect(canEditTaEntry(entry, { currentPlayerId: "player-1" })).toBe(true);
  });

  it("rejects the owner when self-edit is disabled", () => {
    expect(canEditTaEntry(entry, {
      currentPlayerId: "player-1",
      taPlayerSelfEdit: false,
    })).toBe(false);
  });

  it("allows the assigned partner when self-edit is disabled", () => {
    expect(canEditTaEntry(entry, {
      currentPlayerId: "player-2",
      taPlayerSelfEdit: false,
    })).toBe(true);
  });

  it("allows the assigned partner to edit the paired entry", () => {
    expect(canEditTaEntry(entry, { currentPlayerId: "player-2" })).toBe(true);
  });

  it("rejects unrelated players", () => {
    expect(canEditTaEntry(entry, { currentPlayerId: "player-3" })).toBe(false);
  });

  it("rejects everyone when the entry stage is frozen", () => {
    expect(canEditTaEntry(entry, { isAdmin: true, frozenStages: ["qualification"] })).toBe(false);
    expect(canEditTaEntry(entry, { currentPlayerId: "player-1", frozenStages: ["qualification"] })).toBe(false);
    expect(canEditTaEntry(entry, { currentPlayerId: "player-2", frozenStages: ["qualification"] })).toBe(false);
  });
});
