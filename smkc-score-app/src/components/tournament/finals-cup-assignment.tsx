'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CUPS } from '@/lib/constants';

type CupMatch = {
  id: string;
  version: number;
  cup?: string | null;
  cupResults?: unknown;
  races?: unknown;
  player1ReportedRaces?: unknown;
  player2ReportedRaces?: unknown;
};

function hasDetails(match: CupMatch): boolean {
  return [match.cupResults, match.races, match.player1ReportedRaces, match.player2ReportedRaces].some((value) =>
    Array.isArray(value) ? value.length > 0 : value != null,
  );
}

export function FinalsCupAssignment({
  match,
  endpoint,
  onSaved,
}: {
  match: CupMatch;
  endpoint: string;
  onSaved: () => void;
}) {
  const t = useTranslations('finals');
  const [cup, setCup] = useState(match.cup && CUPS.includes(match.cup as (typeof CUPS)[number]) ? match.cup : CUPS[0]);
  const [resolution, setResolution] = useState<'keep' | 'clear' | 'cancel'>(hasDetails(match) ? 'keep' : 'keep');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (resolution === 'cancel') return;
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: match.id, cupAssignment: { cup, expectedVersion: match.version, resolution } }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        alert(payload?.error || t('failedUpdateMatchCup'));
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border p-2 text-sm">
      <div className="space-y-1">
        <Label>{t('matchCup')}</Label>
        <Select value={cup} onValueChange={setCup}>
          <SelectTrigger aria-label="Match cup" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CUPS.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {hasDetails(match) && (
        <div className="space-y-1">
          <Label>{t('cupDetailsResolution')}</Label>
          <Select value={resolution} onValueChange={(value) => setResolution(value as 'keep' | 'clear' | 'cancel')}>
            <SelectTrigger aria-label="Cup details resolution" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keep">{t('keepCupDetails')}</SelectItem>
              <SelectItem value="clear">{t('clearCupDetails')}</SelectItem>
              <SelectItem value="cancel">{t('cancelCupChange')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={saving || resolution === 'cancel'}
        onClick={() => void save()}
      >
        {t('saveMatchCup')}
      </Button>
    </div>
  );
}
