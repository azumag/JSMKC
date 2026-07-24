'use client';

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
        .join('
');
      const pending = archivePending || preview.archivePending;
      const confirmation = japanese
        ? `CDMアーカイブ用の日程補正を確認します。

変更件数: ${preview.totalChanges}
${details}
${pending ? '
前回の補正後、アーカイブ再生成が未完了です。今回は再生成を再試行します。
' : '
'}
実試合ID・得点・自己申告は保持されます。JSMKC大会には適用されません。
確定するには大会名を正確に入力してください。`
        : `Review the CDM archive schedule reconciliation.

Changes: ${preview.totalChanges}
${details}
${pending ? '
A previous correction is waiting for archive regeneration. This will retry it.
' : '
'}
Competitive match IDs, results, and reports are preserved. JSMKC tournaments are excluded.
Type the exact tournament name to continue.`;
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
            ? `CDM日程へ補正し、アーカイブを再生成しました。
${result.archiveGeneratedAt}`
            : `日程は既に一致していました。アーカイブを再生成しました。
${result.archiveGeneratedAt}`
          : result.applied
            ? `CDM schedule reconciled and archive regenerated.
${result.archiveGeneratedAt}`
            : `Schedule already matched. The archive was regenerated.
${result.archiveGeneratedAt}`,
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
