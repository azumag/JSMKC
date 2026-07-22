'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

type ReconcileMatch = {
  id: string;
  stage?: string | null;
  round?: string | null;
  completed: boolean;
  version: number;
};

type ReconcileBlocker = {
  matchId?: string;
  matchNumber?: number;
  round?: string | null;
  reason?: string;
};

type ReconcilePreview = {
  status: 'unavailable' | 'in_sync' | 'stale' | 'blocked';
  changes: Array<{ targetMatchNumber?: number; slot?: number; beforePlayerId?: string | null; afterPlayerId?: string }>;
  affectedMatches: Array<{ id?: string; matchNumber?: number; round?: string | null; reasons?: string[] }>;
  expectedVersions: Record<string, number>;
};

/**
 * Rebuilds only the pending Upper opening slots sourced by completed Top-24
 * barrage R2 matches. The API derives the mapping; this component sends only
 * the optimistic-lock versions currently shown to the administrator.
 */
export function FinalsPlayoffReconciliation({
  matches,
  playoffMatches,
  endpoint,
  onSaved,
}: {
  matches: ReconcileMatch[];
  playoffMatches: ReconcileMatch[];
  endpoint: string;
  onSaved: () => void;
}) {
  const t = useTranslations('finals');
  const [saving, setSaving] = useState(false);
  const [blockers, setBlockers] = useState<ReconcileBlocker[]>([]);
  const [preview, setPreview] = useState<ReconcilePreview | null>(null);
  const barrageR2 = playoffMatches.filter((match) => match.round === 'playoff_r2');
  const available = matches.length > 0 && barrageR2.length === 4 && barrageR2.every((match) => match.completed);

  const refreshPreview = useCallback(async () => {
    if (!available) {
      setPreview(null);
      return;
    }
    const response = await fetch(endpoint);
    const payload = await response.json().catch(() => null);
    setPreview(payload?.data?.upperReconciliation ?? null);
  }, [available, endpoint]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview]);

  if (!available || !preview || preview.status === 'unavailable') return null;

  const reconcile = async () => {
    setSaving(true);
    setBlockers([]);
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upperReconciliation: { expectedVersions: preview.expectedVersions } }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setBlockers(Array.isArray(payload?.details?.blockers) ? payload.details.blockers : [{ reason: payload?.code }]);
        return;
      }
      if (payload?.data?.status === 'in_sync') {
        setBlockers([{ reason: 'IN_SYNC' }]);
        await refreshPreview();
        return;
      }
      onSaved();
      await refreshPreview();
    } finally {
      setSaving(false);
    }
  };

  const isBlocked = preview.status === 'blocked';
  const isInSync = preview.status === 'in_sync';
  return (
    <div
      className={`space-y-2 rounded-md border p-3 ${isInSync ? 'border-muted bg-muted/30' : 'border-amber-500/50 bg-amber-500/10'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t('reconcileUpperSlots')}</p>
          <p className="text-xs text-muted-foreground">{t('reconcileUpperSlotsDesc')}</p>
        </div>
        {!isBlocked && !isInSync && (
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void reconcile()}>
            {t('reconcileUpperSlotsRun')}
          </Button>
        )}
      </div>
      {isInSync && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('reconcileUpperSlotsInSync')}
        </p>
      )}
      {!isInSync && preview.changes.length > 0 && (
        <ul className="text-xs text-muted-foreground">
          {preview.changes.map((change, index) => (
            <li key={`${change.targetMatchNumber}-${change.slot}-${index}`}>
              M{change.targetMatchNumber} {change.slot}P: {String(change.beforePlayerId ?? 'TBD')} →{' '}
              {change.afterPlayerId}
            </li>
          ))}
        </ul>
      )}
      {isBlocked && (
        <div role="status" className="text-xs text-amber-900 dark:text-amber-200">
          <p>{t('reconcileUpperSlotsBlocked')}</p>
          <ul className="mt-1 list-inside list-disc">
            {preview.affectedMatches
              .filter((match) => (match.reasons?.length ?? 0) > 0)
              .map((match) => (
                <li key={match.id}>{`M${match.matchNumber}: ${match.round}: ${match.reasons?.join(', ')}`}</li>
              ))}
          </ul>
        </div>
      )}
      {blockers.length > 0 && (
        <div role="status" className="text-xs text-amber-900 dark:text-amber-200">
          {blockers.some((blocker) => blocker.reason === 'IN_SYNC') ? (
            t('reconcileUpperSlotsInSync')
          ) : (
            <>
              <p>{t('reconcileUpperSlotsBlocked')}</p>
              <ul className="mt-1 list-inside list-disc">
                {blockers.map((blocker, index) => (
                  <li key={`${blocker.matchId ?? blocker.matchNumber ?? 'unknown'}-${index}`}>
                    {blocker.matchNumber ? `M${blocker.matchNumber}: ` : ''}
                    {blocker.round ? `${blocker.round}: ` : ''}
                    {blocker.reason ?? 'RECONCILE_CONFLICT'}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
