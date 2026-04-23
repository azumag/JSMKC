import { getParticipantScoreEntryAccessState } from "@/lib/participant-score-entry-access";

describe("getParticipantScoreEntryAccessState", () => {
  it("hides access messaging while the session is loading", () => {
    expect(
      getParticipantScoreEntryAccessState({
        sessionStatus: "loading",
        userType: "player",
        role: null,
      }),
    ).toBe("loading");
  });

  it("allows player sessions", () => {
    expect(
      getParticipantScoreEntryAccessState({
        sessionStatus: "authenticated",
        userType: "player",
        role: null,
      }),
    ).toBe("player");
  });

  it("blocks admin sessions from participant score-entry pages", () => {
    expect(
      getParticipantScoreEntryAccessState({
        sessionStatus: "authenticated",
        userType: "admin",
        role: "admin",
      }),
    ).toBe("admin-blocked");
  });

  it("requires login for non-player, non-admin sessions", () => {
    expect(
      getParticipantScoreEntryAccessState({
        sessionStatus: "unauthenticated",
        userType: null,
        role: null,
      }),
    ).toBe("login-required");
  });
});
