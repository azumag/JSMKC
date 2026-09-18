'use client';

/**
 * Admin-only button that calls POST /api/tournaments/:id/{mode}/debug-fill
 * to auto-fill empty qualification scores. Only rendered on tournaments
 * created with `debugMode = true`.
 *
 * Each qualification page (BM/MR/GP/TA) renders this once next to the
 * existing admin controls (Setup / Confirm). The button is hidden entirely
 * when `debugMode` is false, so it never appears for normal tournaments.
 */

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/lib/client-logger';

const logger = createLogger({ serviceName: 'qualification-debug-fill' });

interface DebugFillButtonProps {
  tournamentId: string;
  mode: 'bm' | 'mr' | 'gp' | 'ta';
  /** Called after a successful fill so the parent can refetch standings. */
  onFilled?: () => void;
  className?: string;
}

export function DebugFillButton({ tournamentId, mode, onFilled, className }: DebugFillButtonProps) {
  const tCommon = useTranslations('common');
  const tDebugFill = useTranslations('debugFill');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  async function handleClick() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setStatusText(tDebugFill('running'));
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/${mode}/debug-fill`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = typeof json?.error === 'string' ? json.error : `HTTP ${res.status}`;
        setStatusText(tDebugFill('failure', { message }));
        return;
      }
      const data = json?.data ?? json;
      const filled = typeof data?.filled === 'number' ? data.filled : 0;
      const skipped = typeof data?.skipped === 'number' ? data.skipped : 0;
      setStatusText(tDebugFill('success', { filled, skipped }));
      onFilled?.();
    } catch (err) {
      logger.error('Debug fill request failed:', { error: err, tournamentId, mode });
      setStatusText(tCommon('networkError'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="secondary"
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy}
        title={tDebugFill('title', { mode: mode.toUpperCase() })}
      >
        {busy ? tDebugFill('busyButton') : tDebugFill('button')}
      </Button>
      {statusText && (
        <p role="status" className="text-xs text-muted-foreground mt-1">
          {statusText}
        </p>
      )}
    </div>
  );
}
