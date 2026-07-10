import type { ReactNode } from 'react';
import { CountryFlag } from '@/components/ui/country-flag';
import { cn } from '@/lib/utils';

interface PlayerNamePlayer {
  nickname?: string | null;
  country?: string | null;
}

interface PlayerNameProps {
  player?: PlayerNamePlayer | null;
  locale: string;
  displayName?: ReactNode;
  fallback?: ReactNode;
  forceFallback?: boolean;
  className?: string;
  nameClassName?: string;
}

/**
 * Consistent country-flag + player-name presentation used across tournament UI.
 * `forceFallback` supports unresolved bracket slots without leaking a stale
 * player flag while the slot is intentionally displayed as TBD.
 */
export function PlayerName({
  player,
  locale,
  displayName,
  fallback = null,
  forceFallback = false,
  className,
  nameClassName,
}: PlayerNameProps) {
  const showFallback = forceFallback || !player?.nickname;

  return (
    <span className={cn('inline-flex items-center gap-1.5 min-w-0', className)}>
      {!showFallback && <CountryFlag country={player.country} locale={locale} />}
      <span className={cn('truncate', showFallback && 'text-muted-foreground', nameClassName)}>
        {showFallback ? fallback : (displayName ?? player.nickname)}
      </span>
    </span>
  );
}
