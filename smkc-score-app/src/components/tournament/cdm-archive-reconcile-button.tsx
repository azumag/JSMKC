'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
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

type ApplyResult = {
  applied: boolean;
  archiveGeneratedAt: string;
};

function unwrap<T>(value: unknown): T {
  const record = value as { data?: T };
  return record?.data ?? (value as T);
}

function isApplyResult(value: unknown): value is ApplyResult {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ApplyResult>;
  return (
    typeof record.applied === 'boolean' &&
    typeof record.archiveGeneratedAt === 'string' &&
    record.archiveGeneratedAt.trim().length > 0
  );
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
  const tCommon = useTranslations('common');
  const japanese = locale.startsWith('ja');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  if (status !== 'completed' || excluded) return null;

  const run = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const previewResponse = await fetch(`/api/tournaments/${tournamentId}/qualification-schedule/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview' }),
      });
      if (!previewResponse.ok) {
        logger.error('CDM archive reconciliation preview failed', {
          tournamentId,
          status: previewResponse.status,
        });
        alert(tCommon('networkError'));
        return;
      }
      const previewJson = await previewResponse.json().catch(() => ({}));
      const preview = unwrap<Preview>(previewJson);
      const details = (['bm', 'mr', 'gp'] as const)
        .map((mode) => modeLine(mode, preview.modes[mode], japanese))
        .join('\n');
      const pending = archivePending || preview.archivePending;
      const pendingLine = pending
        ? japanese
          ? '\n前回の補正後、アーカイブ再生成が未完了です。今回は再生成を再試行します。\n'
          : '\nA previous correction is waiting for archive regeneration. This will retry it.\n'
        : '\n';
      const confirmation = japanese
        ? `CDMアーカイブ用の日程補正を確認します。\n\n変更件数: ${preview.totalChanges}\n${details}\n${pendingLine}\n実試合ID・得点・自己申告は保持されます。JSMKC大会には適用されません。\n確定するには大会名を正確に入力してください。`
        : `Review the CDM archive schedule reconciliation.\n\nChanges: ${preview.totalChanges}\n${details}\n${pendingLine}\nCompetitive match IDs, results, and reports are preserved. JSMKC tournaments are excluded.\nType the exact tournament name to continue.`;
      const typedName = window.prompt(confirmation);
      if (typedName !== tournamentName) return;

      const applyResponse = await fetch(`/api/tournaments/${tournamentId}/qualification-schedule/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', digest: preview.digest }),
      });
      if (!applyResponse.ok) {
        logger.error('CDM archive reconciliation apply failed', {
          tournamentId,
          status: applyResponse.status,
        });
        alert(tCommon('networkError'));
        return;
      }
      const applyJson = await applyResponse.json().catch(() => ({}));
      const result = unwrap<ApplyResult>(applyJson);
      if (!isApplyResult(result)) {
        throw new Error('Invalid CDM archive reconciliation apply response');
      }
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
      alert(tCommon('networkError'));
    } finally {
      busyRef.current = false;
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
