import {
  canResetTaPhase,
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
        currentPhase: "phase1",
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

  describe("canResetTaPhase", () => {
    it("hides the reset button when the stage has no entries yet", () => {
      expect(canResetTaPhase({ phaseStatus: null, stage: "phase1" })).toBe(false);
      expect(canResetTaPhase({
        phaseStatus: { phase1: null, phase2: null, phase3: null, currentPhase: "qualification" },
        stage: "phase1",
      })).toBe(false);
    });

    it("allows resetting phase1 when neither phase2 nor phase3 has entries", () => {
      expect(canResetTaPhase({
        phaseStatus: {
          phase1: { total: 8, active: 8, eliminated: 0 },
          phase2: null,
          phase3: null,
          currentPhase: "phase1",
        },
        stage: "phase1",
      })).toBe(true);
    });

    it("blocks resetting phase1 once phase2 already has entries (the reported incident)", () => {
      expect(canResetTaPhase({
        phaseStatus: {
          phase1: { total: 8, active: 8, eliminated: 0 },
          phase2: { total: 12, active: 12, eliminated: 0 },
          phase3: null,
          currentPhase: "phase2",
        },
        stage: "phase1",
      })).toBe(false);
    });

    it("blocks resetting phase2 once phase3 has entries, but still allows resetting phase2 itself when only phase1 exists", () => {
      expect(canResetTaPhase({
        phaseStatus: {
          phase1: { total: 4, active: 4, eliminated: 0 },
          phase2: { total: 8, active: 8, eliminated: 0 },
          phase3: { total: 16, active: 16, eliminated: 0, winner: null },
          currentPhase: "phase3",
        },
        stage: "phase2",
      })).toBe(false);

      expect(canResetTaPhase({
        phaseStatus: {
          phase1: { total: 4, active: 4, eliminated: 0 },
          phase2: { total: 8, active: 8, eliminated: 0 },
          phase3: null,
          currentPhase: "phase2",
        },
        stage: "phase2",
      })).toBe(true);
    });

    it("allows resetting phase3 whenever it has entries, since no later phase exists", () => {
      expect(canResetTaPhase({
        phaseStatus: {
          phase1: { total: 4, active: 0, eliminated: 4 },
          phase2: { total: 8, active: 4, eliminated: 4 },
          phase3: { total: 16, active: 16, eliminated: 0, winner: null },
          currentPhase: "phase3",
        },
        stage: "phase3",
      })).toBe(true);
    });
  });
});
