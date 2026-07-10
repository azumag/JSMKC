import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { TaMode } from '@/lib/ta/phase-api-types';

export function TaModeBadge({ mode, verbose = true }: { mode: TaMode; verbose?: boolean }) {
  const t = useTranslations('tournaments');
  const battleRoyale = mode === 'battle_royale';
  const full = battleRoyale ? t('battleRoyaleModeTitle') : t('standardTaModeTitle');
  const compact = battleRoyale ? t('battleRoyaleModeShort') : t('standardTaModeShort');
  return (
    <Badge variant={battleRoyale ? 'default' : 'outline'} title={full} aria-label={full}>
      {verbose ? full : compact}
    </Badge>
  );
}
