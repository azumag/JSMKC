/**
 * Header bar for the OBS dashboard browser source.
 *
 * Renders the tournament's overall progression as a 3-step indicator
 * (予選 → バラッジ → 決勝) with the current step highlighted, plus the
 * detailed phase label below for the round-level signal. Driven entirely
 * by the `currentPhase` string the overlay-events API already emits.
 *
 * Why string-prefix classification (not a new API field): `computeCurrentPhase`
 * is the single source of truth for the dashboard label. Re-deriving the
 * step here from its prefix keeps the component prop-thin and avoids a
 * second server round-trip just to know which big bucket we're in.
 */

"use client";

const STEPS = [
  { key: "qualification", label: "予選" },
  { key: "barrage", label: "バラッジ" },
  { key: "finals", label: "決勝" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

function classifyPhase(phase: string): StepKey {
  if (phase.startsWith("決勝")) return "finals";
  if (phase.startsWith("バラッジ")) return "barrage";
  // "予選", "予選確定", or empty — all collapse to the qualification bucket
  return "qualification";
}

interface DashboardProgressBarProps {
  /** Pre-computed Japanese phase label from `/overlay-events`. */
  currentPhase: string;
}

export function DashboardProgressBar({ currentPhase }: DashboardProgressBarProps) {
  const active = classifyPhase(currentPhase);
  const activeIdx = STEPS.findIndex((s) => s.key === active);

  return (
    <div
      className="rounded-lg px-6 py-5 text-white shadow-2xl ring-1 ring-white/10"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
      data-testid="dashboard-progress-bar"
    >
      <div className="mb-3 text-sm uppercase tracking-widest text-white/50">
        トーナメント進行
      </div>

      {/* Step indicator: dots + connecting bars. The connector between dot N
          and N+1 lights up when N is reached, so the bar visually fills as
          the tournament progresses. */}
      <div className="mb-3 flex items-center">
        {STEPS.map((step, i) => {
          const reached = i <= activeIdx;
          const isCurrent = i === activeIdx;
          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div
                className={`flex h-3 w-3 shrink-0 rounded-full ${
                  reached ? "bg-yellow-400" : "bg-white/20"
                } ${isCurrent ? "ring-2 ring-yellow-400/40" : ""}`}
              />
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-1.5 h-0.5 flex-1 ${
                    i < activeIdx ? "bg-yellow-400" : "bg-white/20"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mb-3 flex justify-between text-sm">
        {STEPS.map((step, i) => (
          <span
            key={step.key}
            className={
              i === activeIdx
                ? "font-semibold text-yellow-400"
                : "text-white/50"
            }
          >
            {step.label}
          </span>
        ))}
      </div>

      {/* Detailed phase label — preserves round-level info like "決勝 QF" or
          "バラッジ1 R3". Empty until the first poll lands. */}
      <div className="text-xl font-semibold leading-tight">
        {currentPhase || "─"}
      </div>
    </div>
  );
}
