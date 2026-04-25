/**
 * Header bar for the OBS dashboard browser source.
 *
 * Renders the tournament's overall progression as a 4-step indicator
 * (予選 → バラッジ → 決勝 → TA決勝) with the current step highlighted, plus
 * the detailed phase label below. The 4th cell (TA決勝) is intentionally
 * always rendered so BM/MR/GP-only tournaments still see a consistent
 * layout — it just stays inactive when the tournament never reaches it.
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
  { key: "ta_finals", label: "TA決勝" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

function classifyPhase(phase: string): StepKey {
  // TA finals tag themselves with "TA-" so we can distinguish them from a
  // 2P bracket round. Order matters: this must be checked before the
  // generic 決勝 prefix below.
  if (phase.startsWith("決勝 TA-") || phase === "決勝 TA") return "ta_finals";
  if (phase.startsWith("決勝")) return "finals";
  if (phase.startsWith("バラッジ")) return "barrage";
  // "予選", "予選確定", or empty — all collapse to the qualification bucket
  return "qualification";
}

interface DashboardProgressBarProps {
  /** Pre-computed Japanese phase label from `/overlay-events`. */
  currentPhase: string;
  /**
   * Optional FT/format chip rendered next to the phase label (e.g. "FT5"
   * for BM/MR bracket finals). Hidden when null/empty.
   */
  currentPhaseFormat?: string | null;
}

export function DashboardProgressBar({
  currentPhase,
  currentPhaseFormat,
}: DashboardProgressBarProps) {
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

      {/* Step indicator. Each STEP gets one equal-width grid cell with the
          dot centered horizontally; a horizontal connector lights up
          between cells once the prior step is reached. Both the dot row
          and the label row share `grid-cols-4`, which guarantees the dot
          and its label sit on the same vertical axis (the previous flex
          layout drifted because justify-between hugged the row edges). */}
      <div className="mb-2 grid grid-cols-4 items-center">
        {STEPS.map((step, i) => {
          const reached = i <= activeIdx;
          const isCurrent = i === activeIdx;
          return (
            <div
              key={step.key}
              className="relative flex h-3 items-center justify-center"
            >
              {/* Connector to the next cell. Stretches from the dot center
                  out to the right edge and into the next cell's left half,
                  which gives the visual continuity of one continuous bar. */}
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

      <div className="mb-3 grid grid-cols-4 text-sm">
        {STEPS.map((step, i) => (
          <span
            key={step.key}
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

      {/* Detailed phase label — preserves round-level info like "決勝 QF" or
          "バラッジ1 R3". The FT badge sits to its right when present, in a
          subtler weight so it reads as metadata rather than the headline. */}
      <div className="flex items-baseline gap-2 leading-tight">
        <span className="text-xl font-semibold">{currentPhase || "─"}</span>
        {currentPhaseFormat && (
          <span
            className="rounded bg-yellow-400/20 px-2 py-0.5 text-sm font-semibold text-yellow-300"
            data-testid="dashboard-progress-bar-format"
          >
            {currentPhaseFormat}
          </span>
        )}
      </div>
    </div>
  );
}
