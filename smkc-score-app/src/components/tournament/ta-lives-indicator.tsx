import { cn } from '@/lib/utils';

export function TaLivesIndicator({
  lives,
  maxLives,
  eliminated,
  eliminatedLabel,
  ariaLabel,
}: {
  lives: number;
  maxLives: number;
  eliminated: boolean;
  eliminatedLabel: string;
  ariaLabel?: string;
}) {
  if (eliminated) {
    return (
      <span className="text-muted-foreground" aria-label={eliminatedLabel}>
        {eliminatedLabel}
      </span>
    );
  }

  const normalizedLives = Math.max(0, lives);
  const label = ariaLabel ?? `${normalizedLives}/${maxLives}`;
  return (
    <span
      className={cn(
        'inline-flex min-w-14 items-center justify-center rounded-full border px-2 py-1 font-mono text-sm tabular-nums',
        normalizedLives <= 1 && 'border-red-500 text-red-600',
      )}
      aria-label={label}
    >
      ♥ {normalizedLives}/{maxLives}
    </span>
  );
}
