import { Badge } from '@/components/ui/badge';
import {
  QUALIFICATION_DIAGNOSTIC_MODES,
  summarizeQualificationScheduleDiagnostics,
  type QualificationScheduleDiagnostics,
} from '@/lib/qualification-schedule-diagnostics';
import type { QualificationSchedulePolicyReason } from '@/lib/qualification-schedule-policy';

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

export function QualificationScheduleDiagnosticsPanel({
  diagnostics,
}: {
  diagnostics: QualificationScheduleDiagnostics;
}) {
  const summary = summarizeQualificationScheduleDiagnostics(diagnostics);

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
          className="grid gap-2 rounded-md border bg-muted/20 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4"
        >
          <div>Legacy circle: {summary.legacyCircleGroupCount}</div>
          <div>CDM fixture unavailable: {summary.cdmFixtureUnavailableGroupCount}</div>
          <div>BREAK required: {summary.cdmBreakRequiredGroupCount}</div>
          <div>Generation blocked: {summary.generationBlockedGroupCount}</div>
        </div>
      )}

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
