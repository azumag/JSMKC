import { Badge } from '@/components/ui/badge';
import { buildBalancedCdmSideSeedOverridePlan } from '@/lib/qualification-balanced-cdm-side-seed-plan';
import { buildLegacyCircleCdmScheduleComparisons } from '@/lib/qualification-schedule-comparison';
import {
  QUALIFICATION_DIAGNOSTIC_MODES,
  buildQualificationSchedulePolicyMatrix,
  summarizeQualificationScheduleDiagnostics,
  type QualificationScheduleDiagnostics,
  type QualificationScheduleDiagnosticsModeBucket,
  type QualificationScheduleDiagnosticsSizeBucket,
} from '@/lib/qualification-schedule-diagnostics';
import type { QualificationSchedulePolicyReason } from '@/lib/qualification-schedule-policy';
import type { QualificationScheduleMethod } from '@/lib/round-robin';

const MODE_LABELS = {
  bm: 'BM',
  mr: 'MR',
  gp: 'GP',
} as const;

const REASON_LABELS: Record<QualificationSchedulePolicyReason, string> = {
  'configured-circle': 'Tournament is explicitly configured for circle scheduling.',
  'cdm-small-group-legacy-circle': 'CDM-first tournament, but groups of 13 or fewer still use circle scheduling.',
  'cdm-requested': 'Current policy requests the CDM fixture for groups of 14 or more.',
};

function formatLegacyCircleSizeBucket(bucket: QualificationScheduleDiagnosticsSizeBucket) {
  const fixture =
    bucket.cdmFixtureCapacity === null
      ? 'no CDM fixture'
      : `${bucket.cdmFixtureCapacity}-slot CDM / ${bucket.cdmBreakSlotCount ?? 0} BREAK`;
  const groupLabel = bucket.groupCount === 1 ? 'group' : 'groups';

  return `${bucket.playerCount} players × ${bucket.groupCount} ${groupLabel} (${fixture})`;
}

function formatLegacyCircleModeBucket(bucket: QualificationScheduleDiagnosticsModeBucket) {
  const groupLabel = bucket.groupCount === 1 ? 'group' : 'groups';
  const playerLabel = bucket.playerCount === 1 ? 'player' : 'players';
  const readyPlayerLabel = bucket.cdmReadyPlayerCount === 1 ? 'player' : 'players';
  const unavailablePlayerLabel = bucket.cdmUnavailablePlayerCount === 1 ? 'player' : 'players';
  const breakSlotLabel = bucket.cdmBreakSlotCount === 1 ? 'slot' : 'slots';

  return `${MODE_LABELS[bucket.mode]} ${bucket.groupCount} ${groupLabel} / ${bucket.playerCount} ${playerLabel} (${bucket.cdmExactFitGroupCount} exact-fit / ${bucket.cdmBreakRequiredGroupCount} BREAK / ${bucket.cdmUnavailableGroupCount} unavailable; ${bucket.cdmReadyPlayerCount} CDM-ready ${readyPlayerLabel} / ${bucket.cdmUnavailablePlayerCount} unavailable ${unavailablePlayerLabel} / ${bucket.cdmBreakSlotCount} BREAK ${breakSlotLabel})`;
}

export function QualificationScheduleDiagnosticsPanel({
  configuredMethod,
  diagnostics,
}: {
  configuredMethod: QualificationScheduleMethod;
  diagnostics: QualificationScheduleDiagnostics;
}) {
  const summary = summarizeQualificationScheduleDiagnostics(diagnostics);
  const policyMatrix = buildQualificationSchedulePolicyMatrix(configuredMethod);
  const smallGroupComparisons = buildLegacyCircleCdmScheduleComparisons();

  return (
    <section aria-labelledby="qualification-schedule-diagnostics-title" className="space-y-3 rounded-md border p-4">
      <div className="space-y-1">
        <h2 id="qualification-schedule-diagnostics-title" className="font-semibold">
          Effective qualification schedule
        </h2>
        <p className="text-sm text-muted-foreground">
          Read-only policy diagnostics. This does not change tournament settings or regenerate qualification matches.
        </p>
      </div>

      {summary.totalGroupCount > 0 && (
        <div
          aria-label="Qualification schedule decision summary"
          className="grid gap-2 rounded-md border bg-muted/20 p-3 text-xs sm:grid-cols-2 lg:grid-cols-3"
        >
          <div>Legacy circle: {summary.legacyCircleGroupCount}</div>
          <div>Legacy circle players: {summary.legacyCirclePlayerCount}</div>
          <div>Legacy circle with CDM fixture: {summary.legacyCircleCdmReadyGroupCount}</div>
          <div>Legacy circle players with CDM fixture: {summary.legacyCircleCdmReadyPlayerCount}</div>
          <div>Legacy circle exact-fit CDM: {summary.legacyCircleCdmExactFitGroupCount}</div>
          <div>Legacy circle CDM with BREAK: {summary.legacyCircleCdmBreakRequiredGroupCount}</div>
          <div>Legacy circle CDM BREAK slots: {summary.legacyCircleCdmBreakSlotCount}</div>
          <div>Legacy circle without CDM fixture: {summary.legacyCircleCdmUnavailableGroupCount}</div>
          <div>Legacy circle players without CDM fixture: {summary.legacyCircleCdmUnavailablePlayerCount}</div>
          <div>CDM fixture unavailable: {summary.cdmFixtureUnavailableGroupCount}</div>
          <div>BREAK required: {summary.cdmBreakRequiredGroupCount}</div>
          <div>Generation blocked: {summary.generationBlockedGroupCount}</div>
          {summary.legacyCircleSizeBreakdown.length > 0 && (
            <div className="sm:col-span-2 lg:col-span-3">
              Legacy circle sizes: {summary.legacyCircleSizeBreakdown.map(formatLegacyCircleSizeBucket).join(' · ')}
            </div>
          )}
          {summary.legacyCircleModeBreakdown.length > 0 && (
            <div className="sm:col-span-2 lg:col-span-3">
              Legacy circle modes: {summary.legacyCircleModeBreakdown.map(formatLegacyCircleModeBucket).join(' · ')}
            </div>
          )}
        </div>
      )}

      <div aria-label="Qualification schedule policy matrix" className="space-y-2 rounded-md border p-3">
        <div>
          <h3 className="font-medium">Policy matrix (7–21 players)</h3>
          <p className="text-xs text-muted-foreground">
            Current effective method and CDM fixture preview for each decision-relevant group size.
          </p>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {policyMatrix.map((decision) => (
            <div key={decision.playerCount} className="rounded border bg-muted/20 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{decision.playerCount} players</span>
                <Badge variant={decision.effectiveMethod === 'cdm' ? 'default' : 'outline'}>
                  {decision.effectiveMethod.toUpperCase()}
                </Badge>
              </div>
              <div className="mt-1 text-muted-foreground">
                {decision.cdmFixtureCapacity === null
                  ? 'CDM fixture unavailable'
                  : `${decision.cdmFixtureCapacity}-slot CDM · ${decision.cdmBreakSlotCount ?? 0} BREAK`}
              </div>
              {!decision.generationSupported && <div className="mt-1 text-destructive">Generation unsupported</div>}
            </div>
          ))}
        </div>
      </div>

      <div aria-label="Circle versus CDM schedule comparison" className="space-y-2 rounded-md border p-3">
        <div>
          <h3 className="font-medium">Circle → CDM impact (7–12 players)</h3>
          <p className="text-xs text-muted-foreground">
            Same-seed read-only comparison for the small-group fixtures available to the pending #3054 decision.
          </p>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {smallGroupComparisons.map((comparison) => (
            <div key={comparison.playerCount} className="rounded border bg-muted/20 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{comparison.playerCount} players</span>
                <Badge variant="outline">{comparison.cdmFixtureCapacity}-slot CDM</Badge>
              </div>
              <div className="mt-1 text-muted-foreground">
                {comparison.realMatchCount} real matches · {comparison.cdmBreakSlotCount} BREAK
              </div>
              <div className="mt-1 text-muted-foreground">
                Schedule days: circle {comparison.circleTotalDays} → CDM {comparison.cdmTotalDays}
              </div>
              <div className="mt-1 text-muted-foreground">
                Max 1P/2P imbalance: circle {comparison.circleMaxSideImbalance} → CDM {comparison.cdmMaxSideImbalance}
              </div>
              <div className="mt-1 text-muted-foreground">
                Players above minimum 1P/2P imbalance: circle {comparison.circleExcessSideImbalancePlayerCount} → CDM{' '}
                {comparison.cdmExcessSideImbalancePlayerCount}
              </div>
              <div className="mt-1">
                Pair set:{' '}
                {comparison.pairSetDifferenceCount === 0
                  ? 'identical'
                  : `${comparison.pairSetDifferenceCount} differences`}
              </div>
              <div className="mt-1 text-muted-foreground">
                Day changes: {comparison.pairDayChangedCount} pairs / {comparison.playerDayChangedCount} players · total
                shift {comparison.totalPairDayShift} days · max shift {comparison.maxPairDayShift} days
              </div>
              <div className="mt-1 text-muted-foreground">
                <span>Seed Day impact: unchanged seeds {comparison.dayUnchangedSeedPositions.join(', ')}</span>
                {' · '}
                <span>
                  peak player shift {comparison.maxPlayerTotalDayShift} days at seeds{' '}
                  {comparison.maxPlayerTotalDayShiftSeedPositions.join(', ')}
                </span>
              </div>
              <div className="mt-1 text-muted-foreground">
                Side changes: {comparison.pairSideChangedCount} pairs / {comparison.playerSideChangedCount} players
              </div>
              <div className="mt-1 text-muted-foreground">
                Balanced-side CDM:{' '}
                {comparison.balancedCdmSidePlanAvailable
                  ? `available · max imbalance ${comparison.balancedCdmMaxSideImbalance} · override ${comparison.balancedCdmSideOverridePairCount} pairs / ${comparison.balancedCdmSideOverridePlayerCount} players`
                  : 'unavailable because pair sets differ'}
              </div>
              {comparison.balancedCdmSidePlanAvailable && (
                <details className="mt-1 text-muted-foreground">
                  <summary className="cursor-pointer">
                    Balanced-side seed overrides ({comparison.balancedCdmSideOverridePairCount})
                  </summary>
                  <div className="mt-1">
                    {buildBalancedCdmSideSeedOverridePlan(comparison.playerCount)
                      ?.map(
                        (override) =>
                          `D${override.day}: ${override.cdmPlayer1Seed}↔${override.cdmPlayer2Seed}`,
                      )
                      .join(' · ') || 'No side overrides required.'}
                  </div>
                </details>
              )}
              <div className="mt-1 text-muted-foreground">
                BYE/BREAK assignment changes: {comparison.byeAssignmentChangedPlayerCount} players
                {comparison.totalByeDayShift !== null && comparison.maxByeDayShift !== null
                  ? ` · total shift ${comparison.totalByeDayShift} days · max shift ${comparison.maxByeDayShift} days`
                  : ' · day shift unavailable'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {QUALIFICATION_DIAGNOSTIC_MODES.map((mode) => {
          const groups = diagnostics[mode];

          return (
            <div key={mode} className="space-y-2 rounded-md bg-muted/40 p-3">
              <h3 className="font-medium">{MODE_LABELS[mode]}</h3>
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No qualification groups yet.</p>
              ) : (
                <ul className="space-y-2">
                  {groups.map((group) => (
                    <li key={group.group} className="rounded-md border bg-background p-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">Group {group.group}</span>
                        <Badge variant={group.effectiveMethod === 'cdm' ? 'default' : 'outline'}>
                          {group.effectiveMethod.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="mt-1 text-muted-foreground">{group.playerCount} players</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Configured: {group.configuredMethod.toUpperCase()} · Effective:{' '}
                        {group.effectiveMethod.toUpperCase()}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {group.cdmFixtureCapacity === null
                          ? `CDM fixture preview: unavailable for ${group.playerCount} players`
                          : `CDM fixture preview: ${group.cdmFixtureCapacity} slots · ${group.cdmBreakSlotCount} BREAK slot${group.cdmBreakSlotCount === 1 ? '' : 's'}`}
                      </div>
                      {!group.generationSupported && (
                        <div
                          role="alert"
                          className="mt-2 rounded border border-destructive/40 p-2 text-xs text-destructive"
                        >
                          Current effective CDM request cannot generate a schedule for {group.playerCount} players
                          because no matching fixture is available.
                        </div>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground">{REASON_LABELS[group.reason]}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
