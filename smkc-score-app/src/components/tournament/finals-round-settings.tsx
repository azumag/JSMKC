'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type RoundMatch = {
  id: string;
  stage?: string | null;
  round?: string | null;
  completed: boolean;
  version: number;
  targetWins?: number | null;
};

export function FinalsRoundSettings({
  match,
  matches,
  endpoint,
  effectiveTargetWins,
  onSaved,
}: {
  match: RoundMatch;
  matches: RoundMatch[];
  endpoint: string;
  effectiveTargetWins: number;
  onSaved: () => void;
}) {
  const t = useTranslations('finals');
  const pendingRoundMatches = matches.filter(
    (candidate) => candidate.stage === match.stage && candidate.round === match.round && !candidate.completed,
  );
  const activeTargetWins =
    pendingRoundMatches.find(
      (candidate): candidate is RoundMatch & { targetWins: number } =>
        typeof candidate.targetWins === 'number' && candidate.targetWins > 0,
    )?.targetWins ?? effectiveTargetWins;
  const pendingFormats = new Set(
    pendingRoundMatches
      .map((candidate) => candidate.targetWins)
      .filter((value): value is number => typeof value === 'number' && value > 0),
  );
  const [targetWins, setTargetWins] = useState(String(activeTargetWins));
  const [saving, setSaving] = useState(false);

  useEffect(() => setTargetWins(String(activeTargetWins)), [match.id, activeTargetWins]);

  const apply = async () => {
    const parsed = Number(targetWins);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 99) return;
    const expectedVersions = Object.fromEntries(
      pendingRoundMatches.map((candidate) => [candidate.id, candidate.version]),
    );
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: match.id, roundSettings: { targetWins: parsed, expectedVersions } }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        alert(payload?.error || t('failedUpdateRoundFormat'));
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-center gap-2 rounded-md border p-2 text-sm">
      <span className="text-muted-foreground">{t('roundFormat')}</span>
      <span>FT</span>
      <Input
        aria-label="Round target wins"
        className="h-8 w-16 text-center"
        type="number"
        min="1"
        max="99"
        value={targetWins}
        onChange={(event) => setTargetWins(event.target.value)}
      />
      <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void apply()}>
        {t('applyToPending')}
      </Button>
      {pendingFormats.size > 1 && (
        <span role="status" className="text-xs text-amber-700">
          {t('inconsistentPendingFormat')}
        </span>
      )}
    </div>
  );
}
