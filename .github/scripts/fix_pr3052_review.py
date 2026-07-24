from pathlib import Path
import re

ROOT = Path('smkc-score-app')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{label}: expected snippet not found')
    return text.replace(old, new, 1)


def replace_regex(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return updated


# ---------------------------------------------------------------------------
# Stable reconciliation policy (persistent flag + optional ID denylist).
# ---------------------------------------------------------------------------
policy_path = ROOT / 'src/lib/cdm-archive-reconciliation-policy.ts'
policy_path.write_text(
    """export type CdmArchiveReconciliationIdentity = {
  id?: string | null;
  name: string;
  slug?: string | null;
  cdmArchiveReconciliationExcluded?: boolean;
};

function configuredExcludedTournamentIds(): Set<string> {
  return new Set(
    (process.env.CDM_ARCHIVE_RECONCILIATION_EXCLUDED_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

/** Match all common JSMKC spellings, including compact forms such as JSMKC2025. */
export function hasJsmkcIdentity(tournament: Pick<CdmArchiveReconciliationIdentity, 'name' | 'slug'>): boolean {
  return /jsmkc/i.test(`${tournament.name} ${tournament.slug ?? ''}`);
}

/**
 * Server-side safety gate for the archive reconciliation workflow.
 *
 * The persisted flag is sticky and is backfilled for existing JSMKC records.
 * The optional ID denylist is a second stable guard for production records.
 * Name/slug matching remains defense-in-depth for legacy or newly imported rows.
 */
export function isCdmArchiveReconciliationExcluded(tournament: CdmArchiveReconciliationIdentity): boolean {
  if (tournament.cdmArchiveReconciliationExcluded === true) return true;
  if (tournament.id && configuredExcludedTournamentIds().has(tournament.id)) return true;
  return hasJsmkcIdentity(tournament);
}
""",
)


# ---------------------------------------------------------------------------
# Planner: derive actual rowsToUpdate from persistence payload differences.
# ---------------------------------------------------------------------------
planner_path = ROOT / 'src/lib/cdm-qualification-reconciliation.ts'
planner = planner_path.read_text()
planner = replace_once(
    planner,
    "import { COURSE_INFO } from '@/lib/constants';\n",
    "import { COURSE_INFO } from '@/lib/constants';\nimport { isCdmArchiveReconciliationExcluded } from '@/lib/cdm-archive-reconciliation-policy';\n",
    'planner policy import',
)
planner = replace_once(
    planner,
    "  retainedRows: CdmReconciliationRow[];\n  createBreakRows: CdmReconciliationBreakRow[];\n",
    "  retainedRows: CdmReconciliationRow[];\n  rowsToUpdate: CdmReconciliationRow[];\n  createBreakRows: CdmReconciliationBreakRow[];\n",
    'planner rowsToUpdate type',
)
planner = replace_once(
    planner,
    "  targetMatchCount: number;\n  movedMatches: number;\n",
    "  targetMatchCount: number;\n  rowUpdates: number;\n  movedMatches: number;\n",
    'planner rowUpdates type',
)
planner = replace_once(
    planner,
    "      retainedRows: [],\n      createBreakRows: [],\n",
    "      retainedRows: [],\n      rowsToUpdate: [],\n      createBreakRows: [],\n",
    'planner skipped rowsToUpdate',
)
planner = replace_once(
    planner,
    "      targetMatchCount: 0,\n      movedMatches: 0,\n",
    "      targetMatchCount: 0,\n      rowUpdates: 0,\n      movedMatches: 0,\n",
    'planner skipped rowUpdates',
)
planner = replace_once(
    planner,
    "  const retainedRows: CdmReconciliationRow[] = [];\n  const createBreakRows: CdmReconciliationBreakRow[] = [];\n",
    "  const retainedRows: CdmReconciliationRow[] = [];\n  const rowsToUpdate: CdmReconciliationRow[] = [];\n  const createBreakRows: CdmReconciliationBreakRow[] = [];\n",
    'planner rowsToUpdate declaration',
)
update_state_helpers = """
function updateRowState(mode: CdmReconciliationMode, row: CdmReconciliationMatch): unknown {
  const common = {
    matchNumber: row.matchNumber,
    roundNumber: row.roundNumber,
    isBye: Boolean(row.isBye),
    player1Id: row.player1Id,
    player2Id: row.player2Id,
    player1Side: row.player1Side,
    player2Side: row.player2Side,
    completed: Boolean(row.completed),
  };

  if (mode === 'bm') {
    return {
      ...common,
      score1: row.score1 ?? null,
      score2: row.score2 ?? null,
      assignedCourses: row.assignedCourses ?? null,
      rounds: row.rounds ?? null,
      player1ReportedScore1: row.player1ReportedScore1 ?? null,
      player1ReportedScore2: row.player1ReportedScore2 ?? null,
      player2ReportedScore1: row.player2ReportedScore1 ?? null,
      player2ReportedScore2: row.player2ReportedScore2 ?? null,
    };
  }

  if (mode === 'mr') {
    return {
      ...common,
      score1: row.score1 ?? null,
      score2: row.score2 ?? null,
      scoresConfirmed: Boolean(row.scoresConfirmed),
      assignedCourses: row.assignedCourses ?? null,
      rounds: row.rounds ?? null,
      player1ReportedPoints1: row.player1ReportedPoints1 ?? null,
      player1ReportedPoints2: row.player1ReportedPoints2 ?? null,
      player1ReportedRaces: row.player1ReportedRaces ?? null,
      player2ReportedPoints1: row.player2ReportedPoints1 ?? null,
      player2ReportedPoints2: row.player2ReportedPoints2 ?? null,
      player2ReportedRaces: row.player2ReportedRaces ?? null,
    };
  }

  return {
    ...common,
    points1: row.points1 ?? null,
    points2: row.points2 ?? null,
    cup: row.cup ?? null,
    races: row.races ?? null,
    player1ReportedPoints1: row.player1ReportedPoints1 ?? null,
    player1ReportedPoints2: row.player1ReportedPoints2 ?? null,
    player1ReportedRaces: row.player1ReportedRaces ?? null,
    player2ReportedPoints1: row.player2ReportedPoints1 ?? null,
    player2ReportedPoints2: row.player2ReportedPoints2 ?? null,
    player2ReportedRaces: row.player2ReportedRaces ?? null,
  };
}

function rowNeedsUpdate(
  mode: CdmReconciliationMode,
  source: CdmReconciliationMatch,
  target: CdmReconciliationRow,
): boolean {
  return !jsonEqual(updateRowState(mode, source), updateRowState(mode, target));
}

"""
planner = replace_once(planner, 'function countMoved(', update_state_helpers + 'function countMoved(', 'planner update state helpers')
planner = replace_once(
    planner,
    "        retainedRows.push(oriented.row);\n        if (countMoved(source, oriented.row)) movedMatches++;\n",
    "        retainedRows.push(oriented.row);\n        if (rowNeedsUpdate(mode, source, oriented.row)) rowsToUpdate.push(oriented.row);\n        if (countMoved(source, oriented.row)) movedMatches++;\n",
    'planner real rowsToUpdate',
)
planner = replace_once(
    planner,
    "          retainedRows.push(row);\n          if (source && countMoved(source, row)) movedMatches++;\n",
    "          retainedRows.push(row);\n          if (source && rowNeedsUpdate(mode, source, row)) rowsToUpdate.push(row);\n          if (source && countMoved(source, row)) movedMatches++;\n",
    'planner break rowsToUpdate',
)
planner = replace_once(
    planner,
    "    retainedRows,\n    createBreakRows,\n",
    "    retainedRows,\n    rowsToUpdate,\n    createBreakRows,\n",
    'planner return rowsToUpdate',
)
planner = replace_once(
    planner,
    "    targetMatchCount: retainedRows.length + createBreakRows.length,\n    movedMatches,\n",
    "    targetMatchCount: retainedRows.length + createBreakRows.length,\n    rowUpdates: rowsToUpdate.length,\n    movedMatches,\n",
    'planner return rowUpdates',
)
planner = replace_regex(
    planner,
    r"const totalChanges = MODE_ORDER\.reduce\(\(sum, mode\) => \{\n    const plan = modes\[mode\];\n    return sum \+ plan\.movedMatches \+ plan\.courseUpdates \+ plan\.cupUpdates \+ plan\.createdBreaks \+ plan\.deletedBreaks;\n  \}, 0\);",
    "const totalChanges = MODE_ORDER.reduce((sum, mode) => {\n    const plan = modes[mode];\n    return sum + plan.rowUpdates + plan.createdBreaks + plan.deletedBreaks;\n  }, 0);",
    'planner totalChanges',
)
planner = replace_once(
    planner,
    "          retainedRows: modes[mode].retainedRows.map(relevantRowState),\n          createBreakRows: modes[mode].createBreakRows,\n",
    "          retainedRows: modes[mode].retainedRows.map(relevantRowState),\n          rowsToUpdate: modes[mode].rowsToUpdate.map(relevantRowState),\n          createBreakRows: modes[mode].createBreakRows,\n",
    'planner digest rowsToUpdate',
)
planner = replace_regex(
    planner,
    r"export function isJsmkcTournamentIdentity\(tournament: \{ name: string; slug\?: string \| null \}\): boolean \{\n  const identity = `\$\{tournament\.name\} \$\{tournament\.slug \?\? ''\}`;\n  return /\(\^\|\[\^a-z0-9\]\)jsmkc\(\[\^a-z0-9\]\|\$\)/i\.test\(identity\);\n\}",
    "export const isJsmkcTournamentIdentity = isCdmArchiveReconciliationExcluded;",
    'planner exclusion helper',
)
planner_path.write_text(planner)


# ---------------------------------------------------------------------------
# Service: atomic update gates, stale mapping, durable archive pending state.
# ---------------------------------------------------------------------------
service_path = ROOT / 'src/lib/cdm-qualification-reconciliation-service.ts'
service = service_path.read_text()
service = replace_once(
    service,
    "  qualificationScheduleMethod: string;\n  bmQualificationConfirmed: boolean;\n",
    "  qualificationScheduleMethod: string;\n  cdmArchiveReconciliationExcluded: boolean;\n  cdmArchiveReconciliationPending: boolean;\n  bmQualificationConfirmed: boolean;\n",
    'service tournament state type',
)
service = replace_once(
    service,
    "      qualificationScheduleMethod: true,\n      bmQualificationConfirmed: true,\n",
    "      qualificationScheduleMethod: true,\n      cdmArchiveReconciliationExcluded: true,\n      cdmArchiveReconciliationPending: true,\n      bmQualificationConfirmed: true,\n",
    'service tournament state select',
)
service = replace_once(
    service,
    "      scheduleMethod: tournament.qualificationScheduleMethod,\n      bmQualificationConfirmed: tournament.bmQualificationConfirmed,\n",
    "      scheduleMethod: tournament.qualificationScheduleMethod,\n      reconciliationExcluded: tournament.cdmArchiveReconciliationExcluded,\n      archivePending: tournament.cdmArchiveReconciliationPending,\n      bmQualificationConfirmed: tournament.bmQualificationConfirmed,\n",
    'service digest tournament state',
)
new_guards = """function tournamentStateGuardStatement(tournament: ReconciliationTournament) {
  return {
    label: 'guard:tournament-state',
    expectedChanges: null as number | null,
    sql: `SELECT json_extract(
      'null',
      CASE WHEN EXISTS (
        SELECT 1 FROM "Tournament"
        WHERE "id" = ?
          AND "name" = ?
          AND (("slug" IS NULL AND ? IS NULL) OR "slug" = ?)
          AND "status" = ?
          AND "qualificationScheduleMethod" = ?
          AND "cdmArchiveReconciliationExcluded" = ?
          AND "cdmArchiveReconciliationPending" = ?
          AND "bmQualificationConfirmed" = ?
          AND "mrQualificationConfirmed" = ?
          AND "gpQualificationConfirmed" = ?
          AND "version" = ?
      ) THEN '$' ELSE '$[RECONCILIATION_STALE_PREVIEW' END
    )`,
    values: [
      tournament.id,
      tournament.name,
      tournament.slug,
      tournament.slug,
      tournament.status,
      tournament.qualificationScheduleMethod,
      tournament.cdmArchiveReconciliationExcluded ? 1 : 0,
      tournament.cdmArchiveReconciliationPending ? 1 : 0,
      tournament.bmQualificationConfirmed ? 1 : 0,
      tournament.mrQualificationConfirmed ? 1 : 0,
      tournament.gpQualificationConfirmed ? 1 : 0,
      tournament.version,
    ],
  };
}

function modeStateGuardStatement(
  mode: CdmReconciliationMode,
  tournamentId: string,
  plan: CdmQualificationReconciliationPlan,
) {
  const payload = JSON.stringify(plan.modes[mode].sourceMatchVersions);
  return {
    label: `guard:${mode}-match-state`,
    expectedChanges: null as number | null,
    sql: `SELECT json_extract(
      'null',
      CASE WHEN
        (SELECT COUNT(*) FROM "${TABLES[mode]}" WHERE "tournamentId" = ? AND "stage" = 'qualification') = json_array_length(?)
        AND NOT EXISTS (
          SELECT 1
          FROM json_each(?) AS expected
          LEFT JOIN "${TABLES[mode]}" AS actual
            ON actual."id" = json_extract(expected.value, '$.id')
           AND actual."tournamentId" = ?
           AND actual."stage" = 'qualification'
          WHERE actual."id" IS NULL
             OR actual."version" <> json_extract(expected.value, '$.version')
        )
      THEN '$' ELSE '$[RECONCILIATION_STALE_PREVIEW' END
    )`,
    values: [tournamentId, payload, payload, tournamentId],
  };
}

"""
service = replace_regex(
    service,
    r"function tournamentStateGuardStatement\([\s\S]*?\n\}\n\nfunction modeStateGuardStatement\([\s\S]*?\n\}\n\n(?=function temporaryMoveStatement)",
    new_guards,
    'service guard functions',
)
service = replace_regex(
    service,
    r"function temporaryMoveStatement\(mode: CdmReconciliationMode, tournamentId: string\) \{[\s\S]*?\n\}\n\n(?=function deleteBreaksStatement)",
    """function temporaryMoveStatement(mode: CdmReconciliationMode, tournamentId: string, ids: string[]) {
  return {
    label: `${mode}:temporary-match-numbers`,
    expectedChanges: ids.length,
    sql: `UPDATE "${TABLES[mode]}" SET "matchNumber" = -1000000000 - "matchNumber" WHERE "tournamentId" = ? AND "stage" = 'qualification' AND "id" IN (SELECT value FROM json_each(?))`,
    values: [tournamentId, JSON.stringify(ids)],
  };
}

""",
    'service temporary move',
)
service = replace_regex(
    service,
    r"function modeStatements\([\s\S]*?\n\}\n\n(?=function reconciliationSummary)",
    """function modeStatements(
  mode: CdmReconciliationMode,
  tournamentId: string,
  plan: CdmQualificationReconciliationPlan,
): BatchStatement[] {
  const modePlan = plan.modes[mode];
  const modeChangeCount = modePlan.rowsToUpdate.length + modePlan.createdBreaks + modePlan.deletedBreaks;
  if (modePlan.skipped || modeChangeCount === 0) return [];

  const statements: BatchStatement[] = [];
  if (modePlan.rowsToUpdate.length > 0) {
    statements.push(
      temporaryMoveStatement(
        mode,
        tournamentId,
        modePlan.rowsToUpdate.map((row) => row.id),
      ),
    );
  }
  if (modePlan.deleteBreakIds.length > 0) {
    statements.push(deleteBreaksStatement(mode, tournamentId, modePlan.deleteBreakIds));
  }
  if (modePlan.rowsToUpdate.length > 0) {
    statements.push(updateRowsStatement(mode, tournamentId, modePlan.rowsToUpdate));
  }
  if (modePlan.createBreakRows.length > 0) {
    statements.push(insertBreaksStatement(mode, tournamentId, modePlan.createBreakRows));
  }
  return statements;
}

""",
    'service mode statements',
)
service = replace_once(
    service,
    "          realMatchCount: item.realMatchCount,\n          movedMatches: item.movedMatches,\n",
    "          realMatchCount: item.realMatchCount,\n          rowUpdates: item.rowUpdates,\n          movedMatches: item.movedMatches,\n",
    'service reconciliation summary rowUpdates',
)
service = replace_once(
    service,
    "    requiresScheduleMethodUpdate: preview.requiresScheduleMethodUpdate,\n    modes: reconciliationSummary(preview.plan),\n",
    "    requiresScheduleMethodUpdate: preview.requiresScheduleMethodUpdate,\n    archivePending: preview.tournament.cdmArchiveReconciliationPending,\n    modes: reconciliationSummary(preview.plan),\n",
    'service public preview pending state',
)
atomic_helpers = """
const STALE_GUARD_MARKER = 'RECONCILIATION_STALE_PREVIEW';
const POSTCONDITION_GUARD_MARKER = 'RECONCILIATION_POSTCONDITION_FAILED';

function postconditionGuardStatement(statement: BatchStatement): BatchStatement {
  return {
    label: `guard:${statement.label}-changes`,
    expectedChanges: null,
    sql: `SELECT json_extract(
      'null',
      CASE WHEN changes() = ? THEN '$' ELSE '$[RECONCILIATION_POSTCONDITION_FAILED' END
    )`,
    values: [statement.expectedChanges],
  };
}

function expandAtomicStatements(statements: BatchStatement[]): BatchStatement[] {
  return statements.flatMap((statement) =>
    statement.expectedChanges === null ? [statement] : [statement, postconditionGuardStatement(statement)],
  );
}

function mappedBatchError(error: unknown): CdmQualificationReconciliationError | null {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes(STALE_GUARD_MARKER)) {
    return new CdmQualificationReconciliationError(
      'Tournament data changed after the preview. Generate a new preview before applying.',
      STALE_GUARD_MARKER,
    );
  }
  if (message.includes(POSTCONDITION_GUARD_MARKER)) {
    return new CdmQualificationReconciliationError(
      'Reconciliation postcondition failed; the D1 batch was rolled back.',
      POSTCONDITION_GUARD_MARKER,
    );
  }
  return null;
}

async function executeAtomicStatements(statements: BatchStatement[]): Promise<void> {
  try {
    const expanded = expandAtomicStatements(statements);
    await executeD1Batch(expanded.map(({ sql, values }) => ({ sql, values })));
  } catch (error) {
    const mapped = mappedBatchError(error);
    if (mapped) throw mapped;
    throw error;
  }
}

function archiveCompletionStatements(
  tournamentId: string,
  auditId: string,
  archiveGeneratedAt: string,
): BatchStatement[] {
  return [
    {
      label: 'tournament:clear-archive-pending',
      expectedChanges: 1,
      sql: `UPDATE "Tournament"
        SET "cdmArchiveReconciliationPending" = 0,
            "version" = "version" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ? AND "status" = 'completed' AND "cdmArchiveReconciliationPending" = 1`,
      values: [tournamentId],
    },
    {
      label: 'audit:archive-complete',
      expectedChanges: 1,
      sql: `UPDATE "AuditLog"
        SET "details" = json_set(
          COALESCE("details", '{}'),
          '$.archiveStatus', 'complete',
          '$.archiveGeneratedAt', ?
        )
        WHERE "id" = ?`,
      values: [archiveGeneratedAt, auditId],
    },
  ];
}

"""
service = replace_once(
    service,
    'export async function applyCdmQualificationReconciliation(params: {',
    atomic_helpers + 'export async function applyCdmQualificationReconciliation(params: {',
    'service atomic helpers insertion',
)
new_apply = """export async function applyCdmQualificationReconciliation(params: {
  tournamentId: string;
  expectedDigest: string;
  audit: Omit<AuditLogParams, 'action' | 'targetId' | 'targetType' | 'details'>;
}) {
  const preview = await previewCdmQualificationReconciliation(params.tournamentId);
  if (preview.digest !== params.expectedDigest) {
    throw new CdmQualificationReconciliationError(
      'Tournament data changed after the preview. Generate a new preview before applying.',
      'RECONCILIATION_STALE_PREVIEW',
    );
  }

  const scheduleApplied = preview.totalChanges > 0;
  const auditId = createId();
  const statements: BatchStatement[] = [
    tournamentStateGuardStatement(preview.tournament),
    ...MODES.filter((mode) => !preview.plan.modes[mode].skipped).map((mode) =>
      modeStateGuardStatement(mode, params.tournamentId, preview.plan),
    ),
    ...MODES.flatMap((mode) => modeStatements(mode, params.tournamentId, preview.plan)),
    {
      label: 'tournament:mark-archive-pending',
      expectedChanges: 1,
      sql: `UPDATE "Tournament"
        SET "qualificationScheduleMethod" = 'cdm',
            "cdmArchiveReconciliationPending" = 1,
            "version" = "version" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ?
          AND "status" = 'completed'
          AND "cdmArchiveReconciliationExcluded" = 0
          AND "version" = ?`,
      values: [params.tournamentId, preview.tournament.version],
    },
  ];

  const audit = buildAuditLogData({
    ...params.audit,
    action: 'RECONCILE_QUALIFICATION_SCHEDULE',
    targetId: params.tournamentId,
    targetType: 'Tournament',
    details: {
      issue: 3051,
      previousScheduleMethod: preview.tournament.qualificationScheduleMethod,
      newScheduleMethod: 'cdm',
      scheduleApplied,
      archiveStatus: 'pending',
      summary: reconciliationSummary(preview.plan),
    },
  });
  statements.push({
    label: 'audit:reconciliation',
    expectedChanges: 1,
    sql: `INSERT INTO "AuditLog" ("id", "userId", "ipAddress", "userAgent", "action", "targetId", "targetType", "timestamp", "details") VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, json(?))`,
    values: [
      auditId,
      audit.userId,
      audit.ipAddress,
      audit.userAgent,
      audit.action,
      audit.targetId,
      audit.targetType,
      JSON.stringify(audit.details ?? {}),
    ],
  });

  await executeAtomicStatements(statements);

  invalidateOverallRankingsCache(params.tournamentId);
  try {
    await invalidate(params.tournamentId);
  } catch (error) {
    logger.warn('Failed to invalidate standings cache after CDM reconciliation', {
      error,
      tournamentId: params.tournamentId,
    });
  }

  let archive;
  try {
    archive = await persistTournamentArchive(params.tournamentId);
  } catch (error) {
    logger.error('CDM schedule was saved but archive regeneration failed', {
      error,
      tournamentId: params.tournamentId,
      scheduleApplied,
    });
    throw new CdmQualificationReconciliationError(
      'The schedule correction was saved, but archive regeneration failed. Retry this operation to regenerate the archive.',
      'ARCHIVE_REGENERATION_PENDING',
      { scheduleApplied, archivePending: true, retryable: true },
    );
  }

  try {
    await executeAtomicStatements(archiveCompletionStatements(params.tournamentId, auditId, archive.generatedAt));
  } catch (error) {
    logger.error('Archive was regenerated but the durable pending state could not be cleared', {
      error,
      tournamentId: params.tournamentId,
      archiveGeneratedAt: archive.generatedAt,
    });
    throw new CdmQualificationReconciliationError(
      'The archive was regenerated, but its pending state could not be cleared. Retry this operation.',
      'ARCHIVE_REGENERATION_PENDING',
      {
        scheduleApplied,
        archivePending: true,
        retryable: true,
        archiveGeneratedAt: archive.generatedAt,
      },
    );
  }

  return {
    applied: scheduleApplied,
    archiveGeneratedAt: archive.generatedAt,
    ...publicCdmReconciliationPreview(preview),
    archivePending: false,
  };
}
"""
service = replace_regex(
    service,
    r"export async function applyCdmQualificationReconciliation\(params: \{[\s\S]*\Z",
    new_apply,
    'service apply function',
)
service_path.write_text(service)


# ---------------------------------------------------------------------------
# Prisma/D1 persistent safety fields.
# ---------------------------------------------------------------------------
schema_path = ROOT / 'prisma/schema.prisma'
schema = schema_path.read_text()
schema = replace_once(
    schema,
    '  qualificationScheduleMethod String    @default("circle") // circle (legacy) or cdm (RR 2025 Start fixture)\n',
    '  qualificationScheduleMethod         String  @default("circle") // circle (legacy) or cdm (RR 2025 Start fixture)\n  cdmArchiveReconciliationExcluded Boolean @default(false) // Sticky protection for JSMKC and explicit exclusions\n  cdmArchiveReconciliationPending  Boolean @default(false) // Blocks stale archive use until R2 regeneration succeeds\n',
    'schema reconciliation fields',
)
schema_path.write_text(schema)

migration = """ALTER TABLE "Tournament" ADD COLUMN "cdmArchiveReconciliationExcluded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tournament" ADD COLUMN "cdmArchiveReconciliationPending" BOOLEAN NOT NULL DEFAULT false;

-- Existing JSMKC records are protected permanently, including compact names such as JSMKC2025.
UPDATE "Tournament"
SET "cdmArchiveReconciliationExcluded" = true
WHERE instr(lower("name"), 'jsmkc') > 0
   OR instr(lower(COALESCE("slug", '')), 'jsmkc') > 0;
"""
(ROOT / 'migrations/0049_add_cdm_archive_reconciliation_state.sql').write_text(migration)
prisma_migration = ROOT / 'prisma/migrations/0030_add_cdm_archive_reconciliation_state/migration.sql'
prisma_migration.parent.mkdir(parents=True, exist_ok=True)
prisma_migration.write_text(migration)


# ---------------------------------------------------------------------------
# Persist the exclusion flag for newly created/renamed JSMKC tournaments.
# ---------------------------------------------------------------------------
create_route_path = ROOT / 'src/app/api/tournaments/route.ts'
create_route = create_route_path.read_text()
create_route = replace_once(
    create_route,
    "import { readTournamentArchiveIndex } from '@/lib/tournament-archive';\n",
    "import { readTournamentArchiveIndex } from '@/lib/tournament-archive';\nimport { hasJsmkcIdentity } from '@/lib/cdm-archive-reconciliation-policy';\n",
    'create route policy import',
)
create_route = replace_once(
    create_route,
    "        ...(qualificationScheduleMethod !== undefined && { qualificationScheduleMethod }),\n        debugMode: debugMode === true,\n",
    "        ...(qualificationScheduleMethod !== undefined && { qualificationScheduleMethod }),\n        ...(hasJsmkcIdentity({ name, slug }) && { cdmArchiveReconciliationExcluded: true }),\n        debugMode: debugMode === true,\n",
    'create route sticky exclusion',
)
create_route_path.write_text(create_route)

update_route_path = ROOT / 'src/app/api/tournaments/[id]/route.ts'
update_route = update_route_path.read_text()
update_route = replace_once(
    update_route,
    "import { isValidPublicModes } from '@/lib/public-modes';\n",
    "import { isValidPublicModes } from '@/lib/public-modes';\nimport { hasJsmkcIdentity } from '@/lib/cdm-archive-reconciliation-policy';\n",
    'update route policy import',
)
update_route = replace_once(
    update_route,
    "      ...(qualificationScheduleMethod !== undefined && { qualificationScheduleMethod }),\n    };\n",
    "      ...(qualificationScheduleMethod !== undefined && { qualificationScheduleMethod }),\n      ...(hasJsmkcIdentity({ name: typeof name === 'string' ? name : '', slug }) && {\n        cdmArchiveReconciliationExcluded: true,\n      }),\n    };\n",
    'update route sticky exclusion',
)
update_route_path.write_text(update_route)


# ---------------------------------------------------------------------------
# API: stale guard -> 409; archive pending -> 503.
# ---------------------------------------------------------------------------
reconcile_route_path = ROOT / 'src/app/api/tournaments/[id]/qualification-schedule/reconcile/route.ts'
reconcile_route_path.write_text(
    """import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveAuditUserId } from '@/lib/audit-log';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIdentifier, getUserAgent } from '@/lib/request-utils';
import { sanitizeInput } from '@/lib/sanitize';
import { createLogger } from '@/lib/logger';
import { resolveTournamentId } from '@/lib/tournament-identifier';
import {
  createErrorResponse,
  createSuccessResponse,
  handleAuthzError,
  handleRateLimitError,
  handleValidationError,
} from '@/lib/error-handling';
import { CdmQualificationReconciliationError } from '@/lib/cdm-qualification-reconciliation';
import {
  applyCdmQualificationReconciliation,
  previewCdmQualificationReconciliation,
  publicCdmReconciliationPreview,
} from '@/lib/cdm-qualification-reconciliation-service';

const DIGEST_RE = /^[a-f0-9]{64}$/;

function statusForReconciliationError(code: string): number {
  if (code === 'TOURNAMENT_NOT_FOUND') return 404;
  if (code === 'ARCHIVE_REGENERATION_PENDING') return 503;
  if (code === 'RECONCILIATION_POSTCONDITION_FAILED') return 500;
  if (
    code === 'JSMKC_TOURNAMENT_EXCLUDED' ||
    code === 'TOURNAMENT_NOT_COMPLETED' ||
    code === 'QUALIFICATION_NOT_CONFIRMED' ||
    code === 'RECONCILIATION_STALE_PREVIEW'
  ) {
    return 409;
  }
  return 422;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const logger = createLogger('cdm-qualification-reconciliation-api');
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return handleAuthzError();
  }

  const clientIp = getClientIdentifier(request);
  const rateResult = await checkRateLimit('general', clientIp);
  if (!rateResult.success) {
    return handleRateLimitError(rateResult.retryAfter);
  }

  const { id } = await params;
  try {
    const tournamentId = await resolveTournamentId(id);
    const body = sanitizeInput(await request.json());
    const action = body.action;

    if (action !== 'preview' && action !== 'apply') {
      return handleValidationError('action must be "preview" or "apply"', 'action');
    }

    if (action === 'preview') {
      const preview = await previewCdmQualificationReconciliation(tournamentId);
      return createSuccessResponse(publicCdmReconciliationPreview(preview));
    }

    const digest = body.digest;
    if (typeof digest !== 'string' || !DIGEST_RE.test(digest)) {
      return handleValidationError('A valid preview digest is required', 'digest');
    }

    const result = await applyCdmQualificationReconciliation({
      tournamentId,
      expectedDigest: digest,
      audit: {
        userId: resolveAuditUserId(session),
        ipAddress: clientIp,
        userAgent: getUserAgent(request),
      },
    });
    return createSuccessResponse(result, 'CDM qualification schedule reconciled and archive regenerated');
  } catch (error) {
    if (error instanceof CdmQualificationReconciliationError) {
      return createErrorResponse(error.message, statusForReconciliationError(error.code), error.code, error.details);
    }
    logger.error('Failed to reconcile CDM qualification schedule', {
      error,
      tournamentIdentifier: id,
    });
    return createErrorResponse('Failed to reconcile CDM qualification schedule', 500, 'INTERNAL_ERROR');
  }
}
""",
)


# ---------------------------------------------------------------------------
# Archive endpoint: never serve the previous R2 bundle while pending is true.
# ---------------------------------------------------------------------------
archive_route_path = ROOT / 'src/app/api/tournaments/[id]/archive/route.ts'
archive_route_path.write_text(
    """/**
 * Tournament Archive API Route
 *
 * GET  /api/tournaments/[id]/archive - Read the immutable R2 archive bundle.
 * POST /api/tournaments/[id]/archive - Regenerate the archive for a completed tournament.
 */
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse, handleAuthError, handleAuthzError } from '@/lib/error-handling';
import { persistTournamentArchive, readTournamentArchive } from '@/lib/tournament-archive';
import { resolveTournament } from '@/lib/tournament-identifier';
import { createLogger } from '@/lib/logger';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const liveTournament = await resolveTournament(id, { id: true, cdmArchiveReconciliationPending: true });
  if (liveTournament?.cdmArchiveReconciliationPending) {
    return createErrorResponse(
      'Tournament archive regeneration is pending; the previous archive is not a finalized record.',
      409,
      'ARCHIVE_REGENERATION_PENDING',
    );
  }

  const archive = await readTournamentArchive(id);
  if (!archive) {
    return createErrorResponse('Tournament archive not found', 404, 'NOT_FOUND');
  }

  const publicModes = (archive.tournament.publicModes as string[]) || [];
  if (publicModes.length === 0) {
    return handleAuthzError('This archived tournament has no visible modes');
  }

  return createSuccessResponse(archive);
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const logger = createLogger('tournament-archive-api');
  const session = await auth();
  if (!session?.user) return handleAuthError('Authentication required');
  if (session.user.role !== 'admin') return handleAuthzError();

  const { id } = await params;
  const tournament = await resolveTournament(id, { id: true, status: true });
  if (!tournament) {
    return createErrorResponse('Tournament not found', 404, 'NOT_FOUND');
  }
  if (tournament.status !== 'completed') {
    return createErrorResponse('Only completed tournaments can be archived', 409, 'CONFLICT');
  }

  try {
    const archive = await persistTournamentArchive(tournament.id);
    return createSuccessResponse(archive);
  } catch (error) {
    logger.error('Failed to persist tournament archive', { error, tournamentId: tournament.id });
    return createErrorResponse('Failed to persist tournament archive', 500, 'INTERNAL_ERROR');
  }
}
""",
)


# ---------------------------------------------------------------------------
# Admin page/client: shared policy, visible retry state, no duplicate regex.
# ---------------------------------------------------------------------------
page_path = ROOT / 'src/app/tournaments/[id]/cdm-archive-reconcile/page.tsx'
page_path.write_text(
    """import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { resolveTournamentId } from '@/lib/tournament-identifier';
import { isCdmArchiveReconciliationExcluded } from '@/lib/cdm-archive-reconciliation-policy';
import { CdmArchiveReconcileButton } from '@/components/tournament/cdm-archive-reconcile-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function CdmArchiveReconciliationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user || session.user.role !== 'admin') {
    redirect(`/tournaments/${id}/ta`);
  }

  let tournamentId: string;
  try {
    tournamentId = await resolveTournamentId(id);
  } catch {
    notFound();
  }
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      qualificationScheduleMethod: true,
      cdmArchiveReconciliationExcluded: true,
      cdmArchiveReconciliationPending: true,
    },
  });
  if (!tournament) notFound();

  const excluded = isCdmArchiveReconciliationExcluded(tournament);

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>CDM archive schedule reconciliation</CardTitle>
        <CardDescription>
          Existing competitive match IDs, scores, reports, and audit history are preserved while qualification Day,
          player side, MR course card, and GP cup are aligned to the RR 2025 fixture.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Tournament</dt>
            <dd className="font-medium">{tournament.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Current schedule method</dt>
            <dd className="font-mono">{tournament.qualificationScheduleMethod}</dd>
          </div>
        </dl>
        {excluded ? (
          <p className="text-sm text-muted-foreground">JSMKC tournaments are intentionally excluded from correction.</p>
        ) : tournament.status !== 'completed' ? (
          <p className="text-sm text-muted-foreground">
            Complete and confirm the tournament before generating its archival correction.
          </p>
        ) : (
          <>
            {tournament.cdmArchiveReconciliationPending ? (
              <p className="text-sm font-medium text-amber-700">
                The schedule was saved, but archive regeneration is still pending. Retry to finalize the archive.
              </p>
            ) : null}
            <CdmArchiveReconcileButton
              tournamentId={tournament.id}
              tournamentName={tournament.name}
              status={tournament.status}
              excluded={excluded}
              archivePending={tournament.cdmArchiveReconciliationPending}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
""",
)

button_path = ROOT / 'src/components/tournament/cdm-archive-reconcile-button.tsx'
button_path.write_text(
    """'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/lib/client-logger';

const logger = createLogger({ serviceName: 'cdm-archive-reconcile-button' });

type ModeSummary = {
  skipped: boolean;
  sourceMatchCount: number;
  targetMatchCount: number;
  realMatchCount: number;
  rowUpdates: number;
  movedMatches: number;
  sideSwaps: number;
  courseUpdates: number;
  cupUpdates: number;
  createdBreaks: number;
  deletedBreaks: number;
};

type Preview = {
  digest: string;
  totalChanges: number;
  requiresScheduleMethodUpdate: boolean;
  archivePending: boolean;
  modes: Record<'bm' | 'mr' | 'gp', ModeSummary>;
};

function unwrap<T>(value: unknown): T {
  const record = value as { data?: T };
  return record?.data ?? (value as T);
}

function errorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback;
  const record = value as { error?: unknown; message?: unknown; data?: { error?: unknown } };
  if (typeof record.error === 'string') return record.error;
  if (typeof record.data?.error === 'string') return record.data.error;
  if (typeof record.message === 'string') return record.message;
  return fallback;
}

function modeLine(mode: string, summary: ModeSummary, japanese: boolean): string {
  if (summary.skipped) return `${mode.toUpperCase()}: ${japanese ? '対象データなし' : 'no qualification data'}`;
  return japanese
    ? `${mode.toUpperCase()}: 実試合 ${summary.realMatchCount}、更新 ${summary.rowUpdates}、移動 ${summary.movedMatches}、左右反転 ${summary.sideSwaps}、BREAK追加 ${summary.createdBreaks}、削除 ${summary.deletedBreaks}`
    : `${mode.toUpperCase()}: ${summary.realMatchCount} real matches, ${summary.rowUpdates} rows updated, ${summary.movedMatches} moved, ${summary.sideSwaps} side swaps, ${summary.createdBreaks} BREAK rows added, ${summary.deletedBreaks} removed`;
}

export function CdmArchiveReconcileButton({
  tournamentId,
  tournamentName,
  status,
  excluded,
  archivePending,
}: {
  tournamentId: string;
  tournamentName: string;
  status: string;
  excluded: boolean;
  archivePending: boolean;
}) {
  const locale = useLocale();
  const japanese = locale.startsWith('ja');
  const [busy, setBusy] = useState(false);

  if (status !== 'completed' || excluded) return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const previewResponse = await fetch(`/api/tournaments/${tournamentId}/qualification-schedule/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview' }),
      });
      const previewJson = await previewResponse.json().catch(() => ({}));
      if (!previewResponse.ok) {
        alert(errorMessage(previewJson, japanese ? '補正プレビューの作成に失敗しました' : 'Failed to build preview'));
        return;
      }
      const preview = unwrap<Preview>(previewJson);
      const details = (['bm', 'mr', 'gp'] as const)
        .map((mode) => modeLine(mode, preview.modes[mode], japanese))
        .join('\n');
      const pending = archivePending || preview.archivePending;
      const confirmation = japanese
        ? `CDMアーカイブ用の日程補正を確認します。\n\n変更件数: ${preview.totalChanges}\n${details}\n${pending ? '\n前回の補正後、アーカイブ再生成が未完了です。今回は再生成を再試行します。\n' : '\n'}\n実試合ID・得点・自己申告は保持されます。JSMKC大会には適用されません。\n確定するには大会名を正確に入力してください。`
        : `Review the CDM archive schedule reconciliation.\n\nChanges: ${preview.totalChanges}\n${details}\n${pending ? '\nA previous correction is waiting for archive regeneration. This will retry it.\n' : '\n'}\nCompetitive match IDs, results, and reports are preserved. JSMKC tournaments are excluded.\nType the exact tournament name to continue.`;
      const typedName = window.prompt(confirmation);
      if (typedName !== tournamentName) return;

      const applyResponse = await fetch(`/api/tournaments/${tournamentId}/qualification-schedule/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', digest: preview.digest }),
      });
      const applyJson = await applyResponse.json().catch(() => ({}));
      if (!applyResponse.ok) {
        alert(errorMessage(applyJson, japanese ? 'CDM日程の補正に失敗しました' : 'Reconciliation failed'));
        return;
      }
      const result = unwrap<{ applied: boolean; archiveGeneratedAt: string }>(applyJson);
      alert(
        japanese
          ? result.applied
            ? `CDM日程へ補正し、アーカイブを再生成しました。\n${result.archiveGeneratedAt}`
            : `日程は既に一致していました。アーカイブを再生成しました。\n${result.archiveGeneratedAt}`
          : result.applied
            ? `CDM schedule reconciled and archive regenerated.\n${result.archiveGeneratedAt}`
            : `Schedule already matched. The archive was regenerated.\n${result.archiveGeneratedAt}`,
      );
      window.location.reload();
    } catch (error) {
      logger.error('Failed to reconcile CDM archive schedule', { error, tournamentId });
      alert(japanese ? 'ネットワークエラーが発生しました' : 'A network error occurred');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" disabled={busy} aria-busy={busy} onClick={() => void run()}>
      {busy
        ? japanese
          ? 'CDM日程を確認中…'
          : 'Checking CDM schedule…'
        : archivePending
          ? japanese
            ? 'アーカイブ再生成を再試行'
            : 'Retry archive regeneration'
          : japanese
            ? 'CDM日程を補正／再アーカイブ'
            : 'Reconcile CDM schedule / re-archive'}
    </Button>
  );
}
""",
)


# ---------------------------------------------------------------------------
# Focused planner tests: JSON-only drift, BREAK normalization, stable exclusion.
# ---------------------------------------------------------------------------
planner_test_path = ROOT / '__tests__/lib/cdm-qualification-reconciliation.test.ts'
planner_test_path.write_text(
    """import {
  buildCdmQualificationReconciliationPlan,
  digestCdmQualificationReconciliationPlan,
  isJsmkcTournamentIdentity,
  type CdmQualificationReconciliationPlan,
  type CdmReconciliationInput,
  type CdmReconciliationMatch,
  type CdmReconciliationMode,
} from '@/lib/cdm-qualification-reconciliation';
import { generateRoundRobinSchedule } from '@/lib/round-robin';

function emptyInput(): CdmReconciliationInput {
  return {
    bm: { qualifications: [], matches: [] },
    mr: { qualifications: [], matches: [] },
    gp: { qualifications: [], matches: [] },
  };
}

function legacyMode(
  mode: CdmReconciliationMode,
  count: number,
  group = 'A',
): CdmReconciliationInput[CdmReconciliationMode] {
  const players = Array.from({ length: count }, (_, index) => `${group}${index + 1}`);
  const qualifications = players.map((playerId, index) => ({ playerId, group, seeding: index + 1 }));
  const schedule = generateRoundRobinSchedule(players);
  const matches: CdmReconciliationMatch[] = schedule.matches.map((match, index) => ({
    id: `${mode}-${group}-${index + 1}`,
    matchNumber: index + 1,
    roundNumber: match.day,
    stage: 'qualification',
    isBye: match.isBye,
    player1Id: match.player1Id,
    player2Id: match.player2Id,
    player1Side: 1,
    player2Side: 2,
    completed: true,
    version: 4,
    ...(mode === 'bm'
      ? {
          score1: 3,
          score2: 1,
          rounds: [{ arena: 'BC1', winner: 1 }],
          player1ReportedScore1: 3,
          player1ReportedScore2: 1,
          player2ReportedScore1: 3,
          player2ReportedScore2: 1,
        }
      : mode === 'mr'
        ? {
            score1: 3,
            score2: 1,
            scoresConfirmed: true,
            assignedCourses: ['MC1', 'DP1', 'GV1', 'BC1'],
            rounds: [{ course: 'MC1', winner: 1 }],
            player1ReportedPoints1: 3,
            player1ReportedPoints2: 1,
            player1ReportedRaces: [{ course: 'MC1', winner: 1 }],
            player2ReportedPoints1: 3,
            player2ReportedPoints2: 1,
            player2ReportedRaces: [{ course: 'MC1', winner: 1 }],
          }
        : {
            points1: 30,
            points2: 15,
            cup: 'Mushroom',
            races: [{ course: 'MC1', position1: 1, position2: 2, points1: 9, points2: 6 }],
            player1ReportedPoints1: 30,
            player1ReportedPoints2: 15,
            player1ReportedRaces: [{ course: 'MC1', position1: 1, position2: 2, points1: 9, points2: 6 }],
            player2ReportedPoints1: 30,
            player2ReportedPoints2: 15,
            player2ReportedRaces: [{ course: 'MC1', position1: 1, position2: 2, points1: 9, points2: 6 }],
          }),
  }));
  return { qualifications, matches };
}

function sourceRowsFromPlan(
  plan: CdmQualificationReconciliationPlan,
  mode: CdmReconciliationMode,
): CdmReconciliationMatch[] {
  return [
    ...plan.modes[mode].retainedRows.map((row) => ({ ...row })),
    ...plan.modes[mode].createBreakRows.map((row, index) => ({
      ...row,
      id: `${mode}-created-break-${index + 1}`,
      version: 0,
    })),
  ];
}

describe('CDM qualification reconciliation', () => {
  it('preserves real match IDs and reverses every side-indexed BM result when fixture orientation changes', () => {
    const input = emptyInput();
    input.bm = legacyMode('bm', 8);

    const plan = buildCdmQualificationReconciliationPlan(input);
    expect(plan.modes.bm.realMatchCount).toBe(28);
    expect(
      plan.modes.bm.retainedRows
        .filter((row) => !row.isBye)
        .map((row) => row.id)
        .sort(),
    ).toEqual(input.bm.matches.map((match) => match.id).sort());
    expect(plan.modes.bm.sideSwaps).toBeGreaterThan(0);
    expect(plan.modes.bm.rowUpdates).toBe(28);

    const swapped = plan.modes.bm.retainedRows.find((row) => row.player1Id === 'A6' && row.player2Id === 'A3');
    expect(swapped).toMatchObject({ score1: 1, score2: 3 });
    expect(swapped?.rounds).toEqual([{ arena: 'BC1', winner: 2 }]);
    expect(swapped).toMatchObject({
      player1ReportedScore1: 1,
      player1ReportedScore2: 3,
      player2ReportedScore1: 1,
      player2ReportedScore2: 3,
    });
  });

  it('assigns the canonical MR round card while keeping score and report data', () => {
    const input = emptyInput();
    input.mr = legacyMode('mr', 8);

    const plan = buildCdmQualificationReconciliationPlan(input);
    const round1 = plan.modes.mr.retainedRows.filter((row) => row.roundNumber === 1 && !row.isBye);
    expect(round1).toHaveLength(4);
    for (const match of round1) {
      expect(match.assignedCourses).toEqual(['MC2', 'GV1', 'DP3', 'GV3']);
      expect((match.rounds as Array<{ course: string }>)[0].course).toBe('MC2');
      expect((match.player1ReportedRaces as Array<{ course: string }>)[0].course).toBe('MC2');
    }
    expect(plan.modes.mr.courseUpdates).toBe(28);
  });

  it('updates MR detail JSON even when schedule and assignedCourses already match', () => {
    const seed = emptyInput();
    seed.mr = legacyMode('mr', 8);
    const canonicalPlan = buildCdmQualificationReconciliationPlan(seed);
    const canonicalMatches = sourceRowsFromPlan(canonicalPlan, 'mr');
    const broken = canonicalMatches.find((match) => !match.isBye)!;
    broken.rounds = [{ course: 'WRONG', winner: 1 }];
    broken.player1ReportedRaces = [{ course: 'WRONG', winner: 1 }];

    const input = emptyInput();
    input.mr = { qualifications: seed.mr.qualifications, matches: canonicalMatches };
    const plan = buildCdmQualificationReconciliationPlan(input);

    expect(plan.modes.mr.movedMatches).toBe(0);
    expect(plan.modes.mr.courseUpdates).toBe(0);
    expect(plan.modes.mr.rowUpdates).toBe(1);
    expect(plan.modes.mr.rowsToUpdate.map((row) => row.id)).toEqual([broken.id]);
  });

  it('assigns the canonical GP cup and rewrites race course labels without changing positions or points', () => {
    const input = emptyInput();
    input.gp = legacyMode('gp', 8);

    const plan = buildCdmQualificationReconciliationPlan(input);
    const round1 = plan.modes.gp.retainedRows.filter((row) => row.roundNumber === 1 && !row.isBye);
    expect(round1).toHaveLength(4);
    for (const match of round1) {
      expect(match.cup).toBe('Star');
      const race = (match.races as Array<Record<string, unknown>>)[0];
      expect(race.course).toBe('KB1');
      expect([race.points1, race.points2].sort()).toEqual([6, 9]);
    }
  });

  it('updates GP race JSON even when schedule and cup already match', () => {
    const seed = emptyInput();
    seed.gp = legacyMode('gp', 8);
    const canonicalPlan = buildCdmQualificationReconciliationPlan(seed);
    const canonicalMatches = sourceRowsFromPlan(canonicalPlan, 'gp');
    const broken = canonicalMatches.find((match) => !match.isBye)!;
    broken.races = [{ course: 'WRONG', position1: 1, position2: 2, points1: 9, points2: 6 }];
    broken.player2ReportedRaces = [
      { course: 'WRONG', position1: 1, position2: 2, points1: 9, points2: 6 },
    ];

    const input = emptyInput();
    input.gp = { qualifications: seed.gp.qualifications, matches: canonicalMatches };
    const plan = buildCdmQualificationReconciliationPlan(input);

    expect(plan.modes.gp.movedMatches).toBe(0);
    expect(plan.modes.gp.cupUpdates).toBe(0);
    expect(plan.modes.gp.rowUpdates).toBe(1);
    expect(plan.modes.gp.rowsToUpdate.map((row) => row.id)).toEqual([broken.id]);
  });

  it('adds only schedule BREAK rows when mapping a 14-player group through the 16P fixture', () => {
    const input = emptyInput();
    input.bm = legacyMode('bm', 14);

    const plan = buildCdmQualificationReconciliationPlan(input);
    expect(plan.modes.bm.realMatchCount).toBe(91);
    expect(plan.modes.bm.createdBreaks).toBe(29);
    expect(plan.modes.bm.deletedBreaks).toBe(0);
    expect(plan.modes.bm.targetMatchCount).toBe(120);
    expect(plan.modes.bm.retainedRows.filter((row) => !row.isBye)).toHaveLength(91);
  });

  it('updates a malformed BREAK row even when its schedule position is already canonical', () => {
    const seed = emptyInput();
    seed.bm = legacyMode('bm', 14);
    const canonicalPlan = buildCdmQualificationReconciliationPlan(seed);
    const canonicalMatches = sourceRowsFromPlan(canonicalPlan, 'bm');
    const brokenBreak = canonicalMatches.find((match) => match.isBye)!;
    brokenBreak.completed = false;
    brokenBreak.score1 = 99;
    brokenBreak.player1ReportedScore1 = 99;

    const input = emptyInput();
    input.bm = { qualifications: seed.bm.qualifications, matches: canonicalMatches };
    const plan = buildCdmQualificationReconciliationPlan(input);

    expect(plan.modes.bm.movedMatches).toBe(0);
    expect(plan.modes.bm.createdBreaks).toBe(0);
    expect(plan.modes.bm.deletedBreaks).toBe(0);
    expect(plan.modes.bm.rowUpdates).toBe(1);
    expect(plan.modes.bm.rowsToUpdate.map((row) => row.id)).toEqual([brokenBreak.id]);
  });

  it('rejects duplicate competitive player pairs before producing a mutation plan', () => {
    const input = emptyInput();
    input.bm = legacyMode('bm', 8);
    input.bm.matches.push({ ...input.bm.matches[0], id: 'duplicate', matchNumber: 999 });

    expect(() => buildCdmQualificationReconciliationPlan(input)).toThrow('Duplicate competitive player pair');
  });

  it('produces a deterministic digest and protects all JSMKC spellings and sticky exclusions', async () => {
    const input = emptyInput();
    input.bm = legacyMode('bm', 8);
    const first = buildCdmQualificationReconciliationPlan(input);
    const second = buildCdmQualificationReconciliationPlan(input);

    await expect(digestCdmQualificationReconciliationPlan(first)).resolves.toBe(
      await digestCdmQualificationReconciliationPlan(second),
    );
    expect(isJsmkcTournamentIdentity({ name: 'JSMKC 2025', slug: 'jsmkc-2025' })).toBe(true);
    expect(isJsmkcTournamentIdentity({ name: 'JSMKC2025', slug: 'jsmkc2025' })).toBe(true);
    expect(
      isJsmkcTournamentIdentity({
        id: 'stable-jsmkc-id',
        name: 'Renamed historical event',
        slug: 'renamed-event',
        cdmArchiveReconciliationExcluded: true,
      }),
    ).toBe(true);
    expect(isJsmkcTournamentIdentity({ name: 'CDM 2025 replica', slug: 'cdm-2025' })).toBe(false);
  });
});
""",
)


# ---------------------------------------------------------------------------
# Service tests: atomic guards, pending state, retry semantics.
# ---------------------------------------------------------------------------
service_test_path = ROOT / '__tests__/lib/cdm-qualification-reconciliation-service.test.ts'
service_test_path.write_text(
    """// @ts-nocheck - Prisma and D1 batch mocks deliberately use compact partial shapes.

jest.mock('@/lib/prisma');
jest.mock('@/lib/d1-batch');
jest.mock('@/lib/tournament-archive');
jest.mock('@/lib/standings-cache');
jest.mock('@/lib/points/overall-ranking');
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() })),
}));
jest.mock('@/lib/audit-log', () => ({
  buildAuditLogData: jest.fn((params) => ({
    ...params,
    userId: params.userId ?? null,
  })),
}));

import prisma from '@/lib/prisma';
import { executeD1Batch } from '@/lib/d1-batch';
import { persistTournamentArchive } from '@/lib/tournament-archive';
import { invalidate } from '@/lib/standings-cache';
import { invalidateOverallRankingsCache } from '@/lib/points/overall-ranking';
import { generateRoundRobinSchedule } from '@/lib/round-robin';
import {
  applyCdmQualificationReconciliation,
  previewCdmQualificationReconciliation,
} from '@/lib/cdm-qualification-reconciliation-service';

function completedTournament(overrides = {}) {
  return {
    id: 'cdm-archive',
    name: 'CDM 2025 replica',
    slug: 'cdm-2025-replica',
    status: 'completed',
    qualificationScheduleMethod: 'circle',
    cdmArchiveReconciliationExcluded: false,
    cdmArchiveReconciliationPending: false,
    bmQualificationConfirmed: true,
    mrQualificationConfirmed: false,
    gpQualificationConfirmed: false,
    version: 7,
    ...overrides,
  };
}

function bmLegacyFixture(count = 8) {
  const players = Array.from({ length: count }, (_, index) => `p${index + 1}`);
  const qualifications = players.map((playerId, index) => ({
    playerId,
    group: 'A',
    seeding: index + 1,
  }));
  const schedule = generateRoundRobinSchedule(players);
  const matches = schedule.matches.map((match, index) => ({
    id: `bm-${index + 1}`,
    tournamentId: 'cdm-archive',
    matchNumber: index + 1,
    roundNumber: match.day,
    stage: 'qualification',
    isBye: match.isBye,
    player1Id: match.player1Id,
    player2Id: match.player2Id,
    player1Side: 1,
    player2Side: 2,
    score1: 3,
    score2: 1,
    completed: true,
    version: 2,
    assignedCourses: ['BC1', 'BC2', 'BC3', 'BC4'],
    rounds: [{ arena: 'BC1', winner: 1 }],
    player1ReportedScore1: 3,
    player1ReportedScore2: 1,
    player2ReportedScore1: 3,
    player2ReportedScore2: 1,
  }));
  return { qualifications, matches };
}

function mockModeData({ tournament = completedTournament(), count = 8 } = {}) {
  const bm = bmLegacyFixture(count);
  (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(tournament);
  (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(bm.qualifications);
  (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(bm.matches);
  (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);
  return bm;
}

describe('CDM qualification reconciliation service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (executeD1Batch as jest.Mock).mockResolvedValue([]);
    (invalidate as jest.Mock).mockResolvedValue(undefined);
    (persistTournamentArchive as jest.Mock).mockResolvedValue({ generatedAt: '2026-07-24T15:00:00.000Z' });
  });

  it('refuses persisted JSMKC exclusions before generating a writable preview', async () => {
    mockModeData({
      tournament: completedTournament({
        name: 'Renamed historical event',
        slug: 'renamed-historical-event',
        cdmArchiveReconciliationExcluded: true,
      }),
    });

    await expect(previewCdmQualificationReconciliation('cdm-archive')).rejects.toMatchObject({
      code: 'JSMKC_TOURNAMENT_EXCLUDED',
    });
    expect(executeD1Batch).not.toHaveBeenCalled();
    expect(persistTournamentArchive).not.toHaveBeenCalled();
  });

  it('rejects apply when the preview digest is stale without writing anything', async () => {
    mockModeData();

    await expect(
      applyCdmQualificationReconciliation({
        tournamentId: 'cdm-archive',
        expectedDigest: '0'.repeat(64),
        audit: { userId: 'admin', ipAddress: '127.0.0.1', userAgent: 'jest' },
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_STALE_PREVIEW' });
    expect(executeD1Batch).not.toHaveBeenCalled();
    expect(persistTournamentArchive).not.toHaveBeenCalled();
  });

  it('maps an in-batch stale-state guard failure to RECONCILIATION_STALE_PREVIEW', async () => {
    mockModeData();
    const preview = await previewCdmQualificationReconciliation('cdm-archive');
    (executeD1Batch as jest.Mock).mockRejectedValueOnce(
      new Error("JSON path error near '[RECONCILIATION_STALE_PREVIEW'"),
    );

    await expect(
      applyCdmQualificationReconciliation({
        tournamentId: 'cdm-archive',
        expectedDigest: preview.digest,
        audit: { userId: 'admin', ipAddress: '127.0.0.1', userAgent: 'jest' },
      }),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_STALE_PREVIEW' });

    expect(persistTournamentArchive).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('atomically remaps existing rows, marks archive pending, then clears it after R2 succeeds', async () => {
    mockModeData();
    const preview = await previewCdmQualificationReconciliation('cdm-archive');

    const result = await applyCdmQualificationReconciliation({
      tournamentId: 'cdm-archive',
      expectedDigest: preview.digest,
      audit: { userId: 'admin', ipAddress: '127.0.0.1', userAgent: 'jest' },
    });

    expect(result).toMatchObject({
      applied: true,
      archivePending: false,
      archiveGeneratedAt: '2026-07-24T15:00:00.000Z',
      requiresScheduleMethodUpdate: true,
    });
    expect(executeD1Batch).toHaveBeenCalledTimes(2);
    const initialStatements = (executeD1Batch as jest.Mock).mock.calls[0][0];
    expect(initialStatements.some((statement) => statement.sql.includes('RECONCILIATION_STALE_PREVIEW'))).toBe(true);
    expect(initialStatements.some((statement) => statement.sql.includes('SET "matchNumber" = -1000000000'))).toBe(
      true,
    );
    expect(
      initialStatements.some(
        (statement) =>
          statement.sql.includes('cdmArchiveReconciliationPending') && statement.sql.includes('UPDATE "Tournament"'),
      ),
    ).toBe(true);
    expect(initialStatements.some((statement) => statement.values.includes('RECONCILE_QUALIFICATION_SCHEDULE'))).toBe(
      true,
    );
    const completionStatements = (executeD1Batch as jest.Mock).mock.calls[1][0];
    expect(completionStatements.some((statement) => statement.sql.includes('clear-archive-pending'))).toBe(false);
    expect(completionStatements.some((statement) => statement.sql.includes('cdmArchiveReconciliationPending'))).toBe(true);
    expect(invalidateOverallRankingsCache).toHaveBeenCalledWith('cdm-archive');
    expect(invalidate).toHaveBeenCalledWith('cdm-archive');
    expect(persistTournamentArchive).toHaveBeenCalledWith('cdm-archive');
  });

  it('leaves a durable pending state and returns a retryable error when R2 regeneration fails', async () => {
    mockModeData();
    const preview = await previewCdmQualificationReconciliation('cdm-archive');
    (persistTournamentArchive as jest.Mock).mockRejectedValueOnce(new Error('R2 write failed'));

    await expect(
      applyCdmQualificationReconciliation({
        tournamentId: 'cdm-archive',
        expectedDigest: preview.digest,
        audit: { userId: 'admin', ipAddress: '127.0.0.1', userAgent: 'jest' },
      }),
    ).rejects.toMatchObject({
      code: 'ARCHIVE_REGENERATION_PENDING',
      details: { scheduleApplied: true, archivePending: true, retryable: true },
    });

    expect(executeD1Batch).toHaveBeenCalledTimes(1);
    const initialStatements = (executeD1Batch as jest.Mock).mock.calls[0][0];
    expect(initialStatements.some((statement) => statement.sql.includes('cdmArchiveReconciliationPending'))).toBe(true);
  });

  it('retries archive generation without rewriting matches when the CDM schedule already matches', async () => {
    const players = Array.from({ length: 8 }, (_, index) => `p${index + 1}`);
    const qualifications = players.map((playerId, index) => ({ playerId, group: 'A', seeding: index + 1 }));
    const schedule = generateRoundRobinSchedule(players, { method: 'cdm' });
    const matches = schedule.matches.map((match, index) => ({
      id: `bm-${index + 1}`,
      matchNumber: index + 1,
      roundNumber: match.day,
      stage: 'qualification',
      isBye: false,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      player1Side: 1,
      player2Side: 2,
      score1: 3,
      score2: 1,
      completed: true,
      version: 2,
    }));
    (prisma.tournament.findUnique as jest.Mock).mockResolvedValue(
      completedTournament({ qualificationScheduleMethod: 'cdm', cdmArchiveReconciliationPending: true }),
    );
    (prisma.bMQualification.findMany as jest.Mock).mockResolvedValue(qualifications);
    (prisma.bMMatch.findMany as jest.Mock).mockResolvedValue(matches);
    (prisma.mRQualification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.mRMatch.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.gPQualification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.gPMatch.findMany as jest.Mock).mockResolvedValue([]);

    const preview = await previewCdmQualificationReconciliation('cdm-archive');
    expect(preview.totalChanges).toBe(0);
    const result = await applyCdmQualificationReconciliation({
      tournamentId: 'cdm-archive',
      expectedDigest: preview.digest,
      audit: { userId: 'admin', ipAddress: '127.0.0.1', userAgent: 'jest' },
    });

    expect(result.applied).toBe(false);
    expect(result.archivePending).toBe(false);
    expect(executeD1Batch).toHaveBeenCalledTimes(2);
    const initialStatements = (executeD1Batch as jest.Mock).mock.calls[0][0];
    expect(initialStatements.some((statement) => statement.sql.includes('SET "matchNumber" = -1000000000'))).toBe(
      false,
    );
    expect(persistTournamentArchive).toHaveBeenCalledWith('cdm-archive');
  });
});
""",
)


# ---------------------------------------------------------------------------
# API-level error mapping tests.
# ---------------------------------------------------------------------------
route_test_path = ROOT / '__tests__/app/api/tournaments/[id]/qualification-schedule/reconcile/route.test.ts'
route_test_path.parent.mkdir(parents=True, exist_ok=True)
route_test_path.write_text(
    """jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data: unknown, options?: { status?: number }) => ({ data, status: options?.status ?? 200 })),
  },
  NextRequest: jest.fn(),
}));

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/audit-log', () => ({ resolveAuditUserId: jest.fn(() => 'admin') }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimit: jest.fn() }));
jest.mock('@/lib/request-utils', () => ({
  getClientIdentifier: jest.fn(() => '127.0.0.1'),
  getUserAgent: jest.fn(() => 'jest'),
}));
jest.mock('@/lib/sanitize', () => ({ sanitizeInput: jest.fn((value) => value) }));
jest.mock('@/lib/logger', () => ({
  createLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() })),
}));
jest.mock('@/lib/tournament-identifier', () => ({ resolveTournamentId: jest.fn(async (id) => id) }));
jest.mock('@/lib/cdm-qualification-reconciliation-service', () => ({
  applyCdmQualificationReconciliation: jest.fn(),
  previewCdmQualificationReconciliation: jest.fn(),
  publicCdmReconciliationPreview: jest.fn((value) => value),
}));

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { CdmQualificationReconciliationError } from '@/lib/cdm-qualification-reconciliation';
import { applyCdmQualificationReconciliation } from '@/lib/cdm-qualification-reconciliation-service';
import { POST } from '@/app/api/tournaments/[id]/qualification-schedule/reconcile/route';

function request(body: unknown): NextRequest {
  return {
    json: async () => body,
    headers: { get: () => 'jest' },
  } as unknown as NextRequest;
}

const params = { params: Promise.resolve({ id: 'cdm-archive' }) };

describe('POST qualification schedule reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'admin', role: 'admin' } });
    (checkRateLimit as jest.Mock).mockResolvedValue({ success: true });
  });

  it('returns 409 when the in-batch state guard reports a stale preview', async () => {
    (applyCdmQualificationReconciliation as jest.Mock).mockRejectedValue(
      new CdmQualificationReconciliationError(
        'Tournament data changed after the preview. Generate a new preview before applying.',
        'RECONCILIATION_STALE_PREVIEW',
      ),
    );

    await POST(request({ action: 'apply', digest: 'a'.repeat(64) }), params);

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'RECONCILIATION_STALE_PREVIEW' }),
      { status: 409 },
    );
  });

  it('returns 503 with applied-state details when only archive regeneration remains pending', async () => {
    (applyCdmQualificationReconciliation as jest.Mock).mockRejectedValue(
      new CdmQualificationReconciliationError(
        'The schedule correction was saved, but archive regeneration failed.',
        'ARCHIVE_REGENERATION_PENDING',
        { scheduleApplied: true, archivePending: true, retryable: true },
      ),
    );

    await POST(request({ action: 'apply', digest: 'b'.repeat(64) }), params);

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'ARCHIVE_REGENERATION_PENDING',
        details: { scheduleApplied: true, archivePending: true, retryable: true },
      }),
      { status: 503 },
    );
  });
});
""",
)


# ---------------------------------------------------------------------------
# Existing archive-route test: pending archives must not be served.
# ---------------------------------------------------------------------------
archive_test_path = ROOT / '__tests__/app/api/tournaments/[id]/archive/route.test.ts'
archive_test = archive_test_path.read_text()
archive_test = replace_once(
    archive_test,
    "describe('GET /api/tournaments/[id]/archive', () => {\n  beforeEach(() => jest.clearAllMocks());\n",
    "describe('GET /api/tournaments/[id]/archive', () => {\n  beforeEach(() => {\n    jest.clearAllMocks();\n    mockResolveTournament.mockResolvedValue(null);\n  });\n",
    'archive test GET default live state',
)
archive_test = replace_once(
    archive_test,
    "  // TC-2473\n  it('returns 404 when archive does not exist', async () => {\n",
    """  it('returns 409 and does not serve the previous bundle while reconciliation is pending', async () => {
    mockResolveTournament.mockResolvedValue({
      id: 'tournament-1',
      cdmArchiveReconciliationPending: true,
    });

    await GET(mockReq(), mockParams('tournament-1'));

    expect(mockReadTournamentArchive).not.toHaveBeenCalled();
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'ARCHIVE_REGENERATION_PENDING' }),
      { status: 409 },
    );
  });

  // TC-2473
  it('returns 404 when archive does not exist', async () => {
""",
    'archive test pending case',
)
archive_test_path.write_text(archive_test)


# ---------------------------------------------------------------------------
# Migration compatibility regression.
# ---------------------------------------------------------------------------
migration_test_path = ROOT / '__tests__/docs/prisma-migrations.test.ts'
migration_test = migration_test_path.read_text()
migration_test = replace_once(
    migration_test,
    "  it('never attempts to DROP COLUMN \"taHandicapSeconds\" from Player (D1 does not reliably support it here)', () => {\n",
    """  it('keeps CDM archive reconciliation safety fields and JSMKC backfill aligned', () => {
    const schema = fs.readFileSync(path.join(__dirname, '../../prisma/schema.prisma'), 'utf8');
    const prismaMigration = readMigration('0030_add_cdm_archive_reconciliation_state', 'migration.sql').trim();
    const wranglerMigration = readWranglerMigration('0049_add_cdm_archive_reconciliation_state.sql').trim();

    expect(schema).toContain('cdmArchiveReconciliationExcluded');
    expect(schema).toContain('cdmArchiveReconciliationPending');
    expect(wranglerMigration).toBe(prismaMigration);
    expect(prismaMigration).toContain("instr(lower(\"name\"), 'jsmkc') > 0");

    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE Tournament (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT);
        INSERT INTO Tournament (id, name, slug) VALUES
          ('compact', 'JSMKC2025', 'jsmkc2025'),
          ('spaced', 'JSMKC 2025', 'jsmkc-2025'),
          ('cdm', 'CDM 2025 replica', 'cdm-2025-replica');
      `);
      db.exec(prismaMigration);
      expect(
        db
          .prepare(
            'SELECT id, cdmArchiveReconciliationExcluded, cdmArchiveReconciliationPending FROM Tournament ORDER BY id',
          )
          .all(),
      ).toEqual([
        { id: 'cdm', cdmArchiveReconciliationExcluded: 0, cdmArchiveReconciliationPending: 0 },
        { id: 'compact', cdmArchiveReconciliationExcluded: 1, cdmArchiveReconciliationPending: 0 },
        { id: 'spaced', cdmArchiveReconciliationExcluded: 1, cdmArchiveReconciliationPending: 0 },
      ]);
    } finally {
      db.close();
    }
  });

  it('never attempts to DROP COLUMN "taHandicapSeconds" from Player (D1 does not reliably support it here)', () => {
""",
    'migration safety test',
)
migration_test_path.write_text(migration_test)

print('PR 3052 review fixes applied')
