import {
  canShowTaPhasePromotion,
  hasStartedTaPhase,
  shouldShowTaFinalsPhaseManagement,
} from "@/lib/ta/phase-controls";

describe("TA phase control visibility", () => {
  it("treats a null phase status as unknown/unstarted", () => {
    expect(hasStartedTaPhase(null)).toBe(false);
  });

  it("keeps the finals management card visible when qualification is frozen", () => {
    expect(shouldShowTaFinalsPhaseManagement({
      entriesCount: 24,
      frozenStages: ["qualification"],
      phaseStatus: null,
    })).toBe(true);
  });

  it("keeps the finals management card visible when a phase already exists", () => {
    expect(shouldShowTaFinalsPhaseManagement({
      entriesCount: 24,
      frozenStages: [],
      phaseStatus: {
        phase1: { total: 8, active: 8, eliminated: 0 },
        phase2: null,
        phase3: null,
      },
    })).toBe(true);
  });

  it("does not expose promotion buttons before phase status has loaded", () => {
    expect(canShowTaPhasePromotion({
      phaseStatusLoaded: false,
      promotingPhase: null,
    })).toBe(false);
  });

  it("exposes promotion buttons only after loading and while no promotion is pending", () => {
    expect(canShowTaPhasePromotion({
      phaseStatusLoaded: true,
      promotingPhase: null,
    })).toBe(true);
    expect(canShowTaPhasePromotion({
      phaseStatusLoaded: true,
      promotingPhase: "promote_phase1",
    })).toBe(false);
  });
});
