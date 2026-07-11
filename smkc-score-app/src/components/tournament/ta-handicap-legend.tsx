import { useTranslations } from 'next-intl';
import { TA_HANDICAP_SECONDS } from '@/lib/ta/battle-royale';
import { TA_HANDICAP_TIER_KEYS, formatTaHandicapSeconds } from '@/lib/ta/handicap-display';

export function TaHandicapLegend({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('players');
  return (
    <div className={compact ? 'grid gap-1 text-xs text-muted-foreground' : 'grid gap-2 text-sm'}>
      {TA_HANDICAP_SECONDS.map((seconds) => (
        <div key={seconds} className="flex items-start gap-2">
          <span className="min-w-12 font-mono font-medium text-foreground">{formatTaHandicapSeconds(seconds)}</span>
          <span>{t(TA_HANDICAP_TIER_KEYS[seconds] as never)}</span>
        </div>
      ))}
    </div>
  );
}
