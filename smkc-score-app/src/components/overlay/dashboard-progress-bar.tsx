/**
 * Header bar for the OBS dashboard browser source.
 *
 * Renders the tournament's overall progression as a 3-step indicator.
 * TA uses phase labels (Qualification → Phase N → Phase 3), while bracket
 * modes keep the generic labels (Qualification → Barrage → Finals). The
 * phase detail (e.g. "Finals Winners Quarter Final") and format
 * chip used to live below
 * the steps but
 * duplicated the bottom-strip footer, so they were removed — the steps
 * alone are the dashboard-side signal, and the footer carries the round.
 *
 * Sizing matches the timeline card treatment (same CARD_BASE / CARD_BG)
 * so the panel reads as one consistent stack rather than two visual systems.
 *
 * Why string-prefix classification (not a new API field): `computeCurrentPhase`
 * is the single source of truth for the dashboard label. Re-deriving the
 * step here from its prefix keeps the component prop-thin.
 */

"use client";

const STEPS = [
  { key: "qualification", label: "Qualification" },
  { key: "barrage", label: "Barrage" },
  { key: "finals", label: "Finals" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];
interface ProgressStep {
  key: StepKey;
  label: string;
}

function classifyPhase(phase: string): StepKey {
  // Mode-prefixed finals labels and Time Attack phase3 both map to the finals
  // bucket — the round-level distinction lives in the footer.
  if (phase.includes("Finals") || phase.startsWith("Time Attack Phase 3")) {
    return "finals";
  }
  if (phase.startsWith("Time Attack Phase 1") || phase.startsWith("Time Attack Phase 2")) {
    return "barrage";
  }
  if (phase.startsWith("Barrage")) return "barrage";
  // Qualification, Qualification Locked, or empty all collapse here.
  return "qualification";
}

function progressStepsForPhase(phase: string): readonly ProgressStep[] {
  if (!phase.startsWith("Time Attack Phase")) return STEPS;

  const middleLabel = phase.startsWith("Time Attack Phase 1")
    ? "Phase 1"
    : "Phase 2";

  return [
    { key: "qualification", label: "Qualification" },
    { key: "barrage", label: middleLabel },
    { key: "finals", label: "Phase 3" },
  ] as const;
}

interface DashboardProgressBarProps {
  /** Pre-computed phase label from `/overlay-events`. */
  currentPhase: string;
}

export function DashboardProgressBar({ currentPhase }: DashboardProgressBarProps) {
  const steps = progressStepsForPhase(currentPhase);
  const active = classifyPhase(currentPhase);
  const activeIdx = steps.findIndex((s) => s.key === active);

  return (
    <div
      className="rounded-lg border border-white/25 px-4 py-3 text-white shadow-[0_4px_12px_rgba(0,0,0,0.45)]"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.78)" }}
      data-testid="dashboard-progress-bar"
    >
      {/* Step indicator. Each STEP gets one equal-width grid cell with the
          dot centered horizontally; a horizontal connector lights up
          between cells once the prior step is reached. Dot row and label
          row share grid-cols-3 so they line up on the same axis. */}
      <div className="mb-2 grid grid-cols-3 items-center">
        {steps.map((step, i) => {
          const reached = i <= activeIdx;
          const isCurrent = i === activeIdx;
          return (
            <div
              key={step.key}
              className="relative flex h-3 items-center justify-center"
            >
              {i < STEPS.length - 1 && (
                <div
                  className={`pointer-events-none absolute left-1/2 top-1/2 h-0.5 w-full -translate-y-1/2 ${
                    i < activeIdx ? "bg-yellow-400" : "bg-white/20"
                  }`}
                />
              )}
              <div
                className={`relative z-10 h-3 w-3 rounded-full ${
                  reached ? "bg-yellow-400" : "bg-white/20"
                } ${isCurrent ? "ring-2 ring-yellow-400/40" : ""}`}
              />
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 text-sm">
        {steps.map((step, i) => (
          <span
            key={step.key}
            data-testid={`dashboard-progress-step-${step.key}`}
            className={`text-center ${
              i === activeIdx
                ? "font-semibold text-yellow-400"
                : "text-white/50"
            }`}
          >
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}
