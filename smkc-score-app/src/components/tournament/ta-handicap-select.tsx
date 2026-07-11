'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TA_HANDICAP_SECONDS, normalizeTaHandicapSeconds, type TaHandicapSeconds } from '@/lib/ta/battle-royale';
import { formatTaHandicapSeconds } from '@/lib/ta/handicap-display';

interface TaHandicapSelectProps {
  value: number;
  onValueChange: (value: TaHandicapSeconds) => void;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}

export function TaHandicapSelect({
  value,
  onValueChange,
  disabled,
  className,
  'aria-label': ariaLabel,
}: TaHandicapSelectProps) {
  const normalized = normalizeTaHandicapSeconds(value);
  return (
    <Select
      value={String(normalized)}
      onValueChange={(next) => onValueChange(normalizeTaHandicapSeconds(Number(next)))}
      disabled={disabled}
    >
      <SelectTrigger className={className ?? 'w-full min-w-28'} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TA_HANDICAP_SECONDS.map((seconds) => (
          <SelectItem key={seconds} value={String(seconds)}>
            {formatTaHandicapSeconds(seconds)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
