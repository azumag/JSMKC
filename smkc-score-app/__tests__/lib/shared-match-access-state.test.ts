import { getSharedMatchAccessState } from "@/lib/shared-match-access-state";

describe("getSharedMatchAccessState", () => {
  it("hides access messaging while the session is loading", () => {
    expect(
      getSharedMatchAccessState({
        canReport: false,
        isSessionLoading: true,
        isCompleted: false,
        isSubmitted: false,
      }),
    ).toBe("hidden");
  });

  it("shows the unauthorized state for non-participants after session load", () => {
    expect(
      getSharedMatchAccessState({
        canReport: false,
        isSessionLoading: false,
        isCompleted: false,
        isSubmitted: false,
      }),
    ).toBe("unauthorized");
  });

  it("shows the report form for participating players", () => {
    expect(
      getSharedMatchAccessState({
        canReport: true,
        isSessionLoading: false,
        isCompleted: false,
        isSubmitted: false,
      }),
    ).toBe("report-form");
  });

  it("shows the report form for admins on in-progress shared pages", () => {
    expect(
      getSharedMatchAccessState({
        canReport: true,
        isSessionLoading: false,
        isCompleted: false,
        isSubmitted: false,
      }),
    ).toBe("report-form");
  });

  it("hides access state when the match is already completed", () => {
    expect(
      getSharedMatchAccessState({
        canReport: true,
        isSessionLoading: false,
        isCompleted: true,
        isSubmitted: false,
      }),
    ).toBe("hidden");
  });

  it("hides access state after the current user submits a result", () => {
    expect(
      getSharedMatchAccessState({
        canReport: true,
        isSessionLoading: false,
        isCompleted: false,
        isSubmitted: true,
      }),
    ).toBe("hidden");
  });
});
