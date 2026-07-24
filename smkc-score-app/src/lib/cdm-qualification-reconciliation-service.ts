import prisma from '@/lib/prisma';
import { buildAuditLogData, type AuditLogParams } from '@/lib/audit-log';
import { executeD1Batch } from '@/lib/d1-batch';
import { persistTournamentArchive } from '@/lib/tournament-archive';
import { invalidate } from '@/lib/standings-cache';
import { invalidateOverallRankingsCache } from '@/lib/points/overall-ranking';
import {
  buildCdmQualificationReconciliationPlan,
  digestCdmQualificationReconciliationPlan,
  isJsmkcTournamentIdentity,
  CdmQualificationReconciliationError,
  type CdmQualificationReconciliationPlan,
  type CdmReconciliationBreakRow,
  type CdmReconciliationInput,
  type CdmReconciliationMatch,
  type CdmReconciliationMode,
  type CdmReconciliationRow,
} from '@/lib/cdm-qualification-reconciliation';

const MODES: readonly CdmReconciliationMode[] = ['bm', 'mr', 'gp'];

const TABLES: Record<CdmReconciliationMode, string> = {
  bm: 'BMMatch',
  mr: 'MRMatch',
  gp: 'GPMatch',
};

const UPDATE_COLUMNS: Record<CdmReconciliationMode, readonly string[]> = {
  bm: [
    'matchNumber',
    'roundNumber',
    'isBye',
    'player1Id',
    'player2Id',
    'player1Side',
    'player2Side',
    'completed',
    'score1',
    'score2',
    'assignedCourses',
    'rounds',
    'player1ReportedScore1',
    'player1ReportedScore2',
    'player2ReportedScore1',
    'player2ReportedScore2',
  ],
  mr: [
    'matchNumber',
    'roundNumber',
    'isBye',
    'player1Id',
    'player2Id',
    'player1Side',
    'player2Side',
    'completed',
    'score1',
    'score2',
    'scoresConfirmed',
    'assignedCourses',
    'rounds',
    'player1ReportedPoints1',
    'player1ReportedPoints2',
    'player1ReportedRaces',
    'player2ReportedPoints1',
    'player2ReportedPoints2',
    'player2ReportedRaces',
  ],
  gp: [
    'matchNumber',
    'roundNumber',
    'isBye',
    'player1Id',
    'player2Id',
    'player1Side',
    'player2Side',
    'completed',
    'points1',
    'points2',
    'cup',
    'races',
    'player1ReportedPoints1',
    'player1ReportedPoints2',
    'player1ReportedRaces',
    'player2ReportedPoints1',
    'player2ReportedPoints2',
    'player2ReportedRaces',
  ],
};

const INSERT_COLUMNS: Record<CdmReconciliationMode, readonly string[]> = {
  bm: [
    'id',
    'matchNumber',
    'roundNumber',
    'isBye',
    'player1Id',
    'player2Id',
    'player1Side',
    'player2Side',
    'completed',
    'score1',
    'score2',
    'assignedCourses',
    'rounds',
  ],
  mr: [
    'id',
    'matchNumber',
    'roundNumber',
    'isBye',
    'player1Id',
    'player2Id',
    'player1Side',
    'player2Side',
    'completed',
    'score1',
    'score2',
    'scoresConfirmed',
    'assignedCourses',
    'rounds',
  ],
  gp: [
    'id',
    'matchNumber',
    'roundNumber',
    'isBye',
    'player1Id',
    'player2Id',
    'player1Side',
    'player2Side',
    'completed',
    'points1',
    'points2',
    'cup',
    'races',
  ],
};

type ReconciliationTournament = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  qualificationScheduleMethod: string;
  bmQualificationConfirmed: boolean;
  mrQualificationConfirmed: boolean;
  gpQualificationConfirmed: boolean;
  version: number;
};

export type CdmReconciliationPreview = {
  tournament: ReconciliationTournament;
  plan: CdmQualificationReconciliationPlan;
  digest: string;
  requiresScheduleMethodUpdate: boolean;
  totalChanges: number;
};

function qualificationConfirmed(tournament: ReconciliationTournament, mode: CdmReconciliationMode): boolean {
  if (mode === 'bm') return tournament.bmQualificationConfirmed;
  if (mode === 'mr') return tournament.mrQualificationConfirmed;
  return tournament.gpQualificationConfirmed;
}

function assertEligibleTournament(
  tournament: ReconciliationTournament,
  plan: CdmQualificationReconciliationPlan,
): void {
  if (isJsmkcTournamentIdentity(tournament)) {
    throw new CdmQualificationReconciliationError(
      'JSMKC tournaments are explicitly excluded from CDM archive schedule reconciliation',
      'JSMKC_TOURNAMENT_EXCLUDED',
    );
  }
  if (tournament.status !== 'completed') {
    throw new CdmQualificationReconciliationError(
      'CDM archive schedule reconciliation is only available for completed tournaments',
      'TOURNAMENT_NOT_COMPLETED',
      { status: tournament.status },
    );
  }
  for (const mode of MODES) {
    if (!plan.modes[mode].skipped && !qualificationConfirmed(tournament, mode)) {
      throw new CdmQualificationReconciliationError(
        `${mode.toUpperCase()} qualification must be confirmed before archive reconciliation`,
        'QUALIFICATION_NOT_CONFIRMED',
        { mode },
      );
    }
  }
}

async function sha256(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createId(): string {
  return crypto.randomUUID();
}

type QualificationDelegate = {
  findMany: (
    args: Record<string, unknown>,
  ) => Promise<Array<{ playerId: string; group: string; seeding: number | null }>>;
};
type MatchDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<CdmReconciliationMatch[]>;
};

function modeDelegate(mode: CdmReconciliationMode): { qualification: QualificationDelegate; match: MatchDelegate } {
  if (mode === 'bm') {
    return {
      qualification: prisma.bMQualification as unknown as QualificationDelegate,
      match: prisma.bMMatch as unknown as MatchDelegate,
    };
  }
  if (mode === 'mr') {
    return {
      qualification: prisma.mRQualification as unknown as QualificationDelegate,
      match: prisma.mRMatch as unknown as MatchDelegate,
    };
  }
  return {
    qualification: prisma.gPQualification as unknown as QualificationDelegate,
    match: prisma.gPMatch as unknown as MatchDelegate,
  };
}

async function loadInput(tournamentId: string): Promise<{
  tournament: ReconciliationTournament;
  input: CdmReconciliationInput;
}> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      qualificationScheduleMethod: true,
      bmQualificationConfirmed: true,
      mrQualificationConfirmed: true,
      gpQualificationConfirmed: true,
      version: true,
    },
  });
  if (!tournament) {
    throw new CdmQualificationReconciliationError('Tournament not found', 'TOURNAMENT_NOT_FOUND');
  }

  const modeEntries = await Promise.all(
    MODES.map(async (mode) => {
      const delegate = modeDelegate(mode);
      const [qualifications, matches] = await Promise.all([
        delegate.qualification.findMany({
          where: { tournamentId },
          select: { playerId: true, group: true, seeding: true },
        }),
        delegate.match.findMany({
          where: { tournamentId, stage: 'qualification' },
          orderBy: { matchNumber: 'asc' },
        }),
      ]);
      return [mode, { qualifications, matches }] as const;
    }),
  );

  return {
    tournament,
    input: Object.fromEntries(modeEntries) as CdmReconciliationInput,
  };
}

export async function previewCdmQualificationReconciliation(tournamentId: string): Promise<CdmReconciliationPreview> {
  const { tournament, input } = await loadInput(tournamentId);
  const plan = buildCdmQualificationReconciliationPlan(input);
  assertEligibleTournament(tournament, plan);
  const planDigest = await digestCdmQualificationReconciliationPlan(plan);
  const digest = await sha256({
    tournament: {
      id: tournament.id,
      status: tournament.status,
      scheduleMethod: tournament.qualificationScheduleMethod,
      bmQualificationConfirmed: tournament.bmQualificationConfirmed,
      mrQualificationConfirmed: tournament.mrQualificationConfirmed,
      gpQualificationConfirmed: tournament.gpQualificationConfirmed,
      version: tournament.version,
    },
    planDigest,
  });
  const requiresScheduleMethodUpdate = tournament.qualificationScheduleMethod !== 'cdm';
  return {
    tournament,
    plan,
    digest,
    requiresScheduleMethodUpdate,
    totalChanges: plan.totalChanges + (requiresScheduleMethodUpdate ? 1 : 0),
  };
}

function payloadValue(
  row: CdmReconciliationRow | (CdmReconciliationBreakRow & { id: string }),
  column: string,
): unknown {
  const record = row as unknown as Record<string, unknown>;
  if (column === 'isBye' || column === 'completed' || column === 'scoresConfirmed') {
    return record[column] ? 1 : 0;
  }
  return record[column] ?? null;
}

function retainedPayload(mode: CdmReconciliationMode, rows: CdmReconciliationRow[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    id: row.id,
    ...Object.fromEntries(UPDATE_COLUMNS[mode].map((column) => [column, payloadValue(row, column)])),
  }));
}

function createdBreakPayload(
  mode: CdmReconciliationMode,
  rows: CdmReconciliationBreakRow[],
): Record<string, unknown>[] {
  return rows.map((row) => {
    const withId = { ...row, id: createId() };
    return Object.fromEntries(INSERT_COLUMNS[mode].map((column) => [column, payloadValue(withId, column)]));
  });
}

function temporaryMoveStatement(mode: CdmReconciliationMode, tournamentId: string) {
  return {
    label: `${mode}:temporary-match-numbers`,
    expectedChanges: null as number | null,
    sql: `UPDATE "${TABLES[mode]}" SET "matchNumber" = -1000000000 - "matchNumber" WHERE "tournamentId" = ? AND "stage" = 'qualification'`,
    values: [tournamentId],
  };
}

function deleteBreaksStatement(mode: CdmReconciliationMode, tournamentId: string, ids: string[]) {
  return {
    label: `${mode}:delete-breaks`,
    expectedChanges: ids.length,
    sql: `DELETE FROM "${TABLES[mode]}" WHERE "tournamentId" = ? AND "stage" = 'qualification' AND "isBye" = 1 AND "id" IN (SELECT value FROM json_each(?))`,
    values: [tournamentId, JSON.stringify(ids)],
  };
}

function updateRowsStatement(mode: CdmReconciliationMode, tournamentId: string, rows: CdmReconciliationRow[]) {
  const columns = UPDATE_COLUMNS[mode];
  const cteColumns = [
    `json_extract(value, '$.id') AS id`,
    ...columns.map((column) => `json_extract(value, '$.${column}') AS "${column}"`),
  ].join(',\n        ');
  const assignments = [
    ...columns.map((column) => `"${column}" = (SELECT "${column}" FROM plan WHERE plan.id = "${TABLES[mode]}"."id")`),
    `"version" = "version" + 1`,
    `"updatedAt" = CURRENT_TIMESTAMP`,
  ].join(',\n      ');
  const payload = retainedPayload(mode, rows);
  return {
    label: `${mode}:update-retained`,
    expectedChanges: rows.length,
    sql: `WITH plan AS (\n      SELECT ${cteColumns}\n      FROM json_each(?)\n    )\n    UPDATE "${TABLES[mode]}"\n    SET ${assignments}\n    WHERE "tournamentId" = ? AND "stage" = 'qualification' AND "id" IN (SELECT id FROM plan)`,
    values: [JSON.stringify(payload), tournamentId],
  };
}

function insertBreaksStatement(mode: CdmReconciliationMode, tournamentId: string, rows: CdmReconciliationBreakRow[]) {
  const columns = INSERT_COLUMNS[mode];
  const payload = createdBreakPayload(mode, rows);
  const quotedColumns = ['id', 'tournamentId', 'stage', ...columns.filter((column) => column !== 'id')]
    .map((column) => `"${column}"`)
    .join(', ');
  const selectedColumns = [
    `json_extract(value, '$.id')`,
    `?`,
    `'qualification'`,
    ...columns.filter((column) => column !== 'id').map((column) => `json_extract(value, '$.${column}')`),
  ].join(', ');
  return {
    label: `${mode}:insert-breaks`,
    expectedChanges: rows.length,
    sql: `INSERT INTO "${TABLES[mode]}" (${quotedColumns}, "createdAt", "updatedAt")\n      SELECT ${selectedColumns}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM json_each(?)`,
    values: [tournamentId, JSON.stringify(payload)],
  };
}

type BatchStatement = {
  label: string;
  expectedChanges: number | null;
  sql: string;
  values: unknown[];
};

function modeStatements(
  mode: CdmReconciliationMode,
  tournamentId: string,
  plan: CdmQualificationReconciliationPlan,
): BatchStatement[] {
  const modePlan = plan.modes[mode];
  const modeChangeCount =
    modePlan.movedMatches +
    modePlan.courseUpdates +
    modePlan.cupUpdates +
    modePlan.createdBreaks +
    modePlan.deletedBreaks;
  if (modePlan.skipped || modeChangeCount === 0) return [];
  const statements: BatchStatement[] = [temporaryMoveStatement(mode, tournamentId)];
  if (modePlan.deleteBreakIds.length > 0) {
    statements.push(deleteBreaksStatement(mode, tournamentId, modePlan.deleteBreakIds));
  }
  statements.push(updateRowsStatement(mode, tournamentId, modePlan.retainedRows));
  if (modePlan.createBreakRows.length > 0) {
    statements.push(insertBreaksStatement(mode, tournamentId, modePlan.createBreakRows));
  }
  return statements;
}

function reconciliationSummary(plan: CdmQualificationReconciliationPlan) {
  return Object.fromEntries(
    MODES.map((mode) => {
      const item = plan.modes[mode];
      return [
        mode,
        {
          skipped: item.skipped,
          sourceMatchCount: item.sourceMatchCount,
          targetMatchCount: item.targetMatchCount,
          realMatchCount: item.realMatchCount,
          movedMatches: item.movedMatches,
          sideSwaps: item.sideSwaps,
          courseUpdates: item.courseUpdates,
          cupUpdates: item.cupUpdates,
          createdBreaks: item.createdBreaks,
          deletedBreaks: item.deletedBreaks,
        },
      ];
    }),
  );
}

export function publicCdmReconciliationPreview(preview: CdmReconciliationPreview) {
  return {
    digest: preview.digest,
    totalChanges: preview.totalChanges,
    requiresScheduleMethodUpdate: preview.requiresScheduleMethodUpdate,
    modes: reconciliationSummary(preview.plan),
  };
}

export async function applyCdmQualificationReconciliation(params: {
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

  const shouldMutate = preview.totalChanges > 0;
  if (shouldMutate) {
    const statements: BatchStatement[] = MODES.flatMap((mode) =>
      modeStatements(mode, params.tournamentId, preview.plan),
    );
    statements.push({
      label: 'tournament:set-cdm-method',
      expectedChanges: 1,
      sql: `UPDATE "Tournament" SET "qualificationScheduleMethod" = 'cdm', "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ? AND "status" = 'completed'`,
      values: [params.tournamentId],
    });

    const audit = buildAuditLogData({
      ...params.audit,
      action: 'RECONCILE_QUALIFICATION_SCHEDULE',
      targetId: params.tournamentId,
      targetType: 'Tournament',
      details: {
        issue: 3051,
        previousScheduleMethod: preview.tournament.qualificationScheduleMethod,
        newScheduleMethod: 'cdm',
        summary: reconciliationSummary(preview.plan),
      },
    });
    statements.push({
      label: 'audit:reconciliation',
      expectedChanges: 1,
      sql: `INSERT INTO "AuditLog" ("id", "userId", "ipAddress", "userAgent", "action", "targetId", "targetType", "timestamp", "details") VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, json(?))`,
      values: [
        createId(),
        audit.userId,
        audit.ipAddress,
        audit.userAgent,
        audit.action,
        audit.targetId,
        audit.targetType,
        JSON.stringify(audit.details ?? {}),
      ],
    });

    const results = await executeD1Batch(statements.map(({ sql, values }) => ({ sql, values })));
    statements.forEach((statement, index) => {
      if (statement.expectedChanges !== null && results[index] !== statement.expectedChanges) {
        throw new Error(
          `CDM reconciliation postcondition failed for ${statement.label}: expected ${statement.expectedChanges}, got ${results[index]}`,
        );
      }
    });
  }

  invalidateOverallRankingsCache(params.tournamentId);
  await invalidate(params.tournamentId);
  const archive = await persistTournamentArchive(params.tournamentId);

  return {
    applied: shouldMutate,
    archiveGeneratedAt: archive.generatedAt,
    ...publicCdmReconciliationPreview(preview),
  };
}
