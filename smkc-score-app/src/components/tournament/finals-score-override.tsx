'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type OverrideMatch = {
  id: string;
  version: number;
  player1Id: string;
  player2Id: string;
  winnerOverrideId?: string | null;
  player1: { nickname: string };
  player2: { nickname: string };
};

function parseSignedInteger(value: string): number | null {
  if (!/^[+-]?\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Deliberately separate from normal score entry: ordinary users keep the
 * first-to validation, while admins can record an auditable correction. */
export function FinalsScoreOverride({
  match,
  endpoint,
  score1: initialScore1,
  score2: initialScore2,
  onSaved,
}: {
  match: OverrideMatch;
  endpoint: string;
  score1: number;
  score2: number;
  onSaved: () => void;
}) {
  const t = useTranslations('finals');
  const [enabled, setEnabled] = useState(false);
  const [score1, setScore1] = useState(String(initialScore1));
  const [score2, setScore2] = useState(String(initialScore2));
  const [winnerId, setWinnerId] = useState(
    match.winnerOverrideId === match.player1Id || match.winnerOverrideId === match.player2Id
      ? match.winnerOverrideId
      : match.player1Id,
  );
  const [saving, setSaving] = useState(false);
  const parsedScore1 = parseSignedInteger(score1);
  const parsedScore2 = parseSignedInteger(score2);
  if (!enabled) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          id={`finals-override-${match.id}`}
          checked={enabled}
          onCheckedChange={(value) => setEnabled(value === true)}
        />
        <Label htmlFor={`finals-override-${match.id}`}>{t('recordCorrectedResult')}</Label>
      </div>
    );
  }

  const save = async () => {
    const parsed1 = parsedScore1;
    const parsed2 = parsedScore2;
    if (parsed1 === null || parsed2 === null) return;
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matchId: match.id,
        expectedVersion: match.version,
        score1: parsed1,
        score2: parsed2,
        override: true,
        ...(parsed1 === parsed2 ? { winnerId } : {}),
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      alert(payload?.error || t('failedSaveCorrectedResult'));
      return;
    }
    const payload = await response.json().catch(() => null);
    if (Array.isArray(payload?.data?.advancementWarnings) && payload.data.advancementWarnings.length > 0) {
      alert(t('correctedResultDownstreamWarning'));
    }
    onSaved();
  };

  return (
    <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-50/50 p-3 text-sm dark:bg-amber-950/20">
      <div className="flex items-center gap-2">
        <Checkbox
          id={`finals-override-${match.id}`}
          checked={enabled}
          onCheckedChange={(value) => setEnabled(value === true)}
        />
        <Label htmlFor={`finals-override-${match.id}`}>{t('correctedResultSignedTotals')}</Label>
      </div>
      <div className="flex items-center gap-2">
        <Input
          aria-label="Corrected score for player 1"
          type="text"
          inputMode="numeric"
          value={score1}
          onChange={(event) => setScore1(event.target.value)}
        />
        <span>-</span>
        <Input
          aria-label="Corrected score for player 2"
          type="text"
          inputMode="numeric"
          value={score2}
          onChange={(event) => setScore2(event.target.value)}
        />
      </div>
      {parsedScore1 !== null && parsedScore1 === parsedScore2 && (
        <select
          className="h-8 rounded border bg-background px-2"
          value={winnerId}
          onChange={(event) => setWinnerId(event.target.value)}
        >
          <option value={match.player1Id}>{t('tieBreakWinner', { player: match.player1.nickname })}</option>
          <option value={match.player2Id}>{t('tieBreakWinner', { player: match.player2.nickname })}</option>
        </select>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={saving}
        onClick={() => {
          setSaving(true);
          void save().finally(() => setSaving(false));
        }}
      >
        {t('saveCorrectedResult')}
      </Button>
    </div>
  );
}
