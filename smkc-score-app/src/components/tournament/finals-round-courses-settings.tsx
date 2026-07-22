'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { COURSES } from '@/lib/constants';

type RoundMatch = {
  id: string;
  stage?: string | null;
  round?: string | null;
  completed: boolean;
  version: number;
  assignedCourses?: unknown;
};

function toCourses(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((course): course is string => typeof course === 'string') : [];
}

export function FinalsRoundCoursesSettings({
  match,
  matches,
  endpoint,
  onSaved,
}: {
  match: RoundMatch;
  matches: RoundMatch[];
  endpoint: string;
  onSaved: () => void;
}) {
  const t = useTranslations('finals');
  const pending = matches.filter(
    (candidate) => candidate.stage === match.stage && candidate.round === match.round && !candidate.completed,
  );
  const activeCourses = toCourses(pending[0]?.assignedCourses);
  const [value, setValue] = useState(activeCourses.join(', '));
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(activeCourses.join(', ')), [match.id, activeCourses.join('|')]);

  const save = async () => {
    const courses = value
      .split(',')
      .map((course) => course.trim())
      .filter(Boolean);
    if (courses.length === 0 || courses.some((course) => !COURSES.includes(course as (typeof COURSES)[number]))) {
      alert(t('invalidRoundCourses'));
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: match.id,
          roundCourses: {
            courses,
            expectedVersions: Object.fromEntries(pending.map((candidate) => [candidate.id, candidate.version])),
          },
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        alert(payload?.error || t('failedUpdateRoundCourses'));
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-2 text-sm">
      <label className="block text-muted-foreground" htmlFor={`round-courses-${match.id}`}>
        {t('roundCourses')}
      </label>
      <Input
        id={`round-courses-${match.id}`}
        aria-label="Round courses"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="MC1, DP1, GV1, BC1"
      />
      <p className="text-xs text-muted-foreground">{t('roundCoursesHelp')}</p>
      <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void save()}>
        {t('applyCoursesToPending')}
      </Button>
    </div>
  );
}
