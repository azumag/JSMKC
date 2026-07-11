import { Badge } from '@/components/ui/badge';
import { formatTaHandicapSeconds } from '@/lib/ta/handicap-display';

export function TaHandicapBadge({ value, title }: { value: number; title?: string }) {
  return (
    <Badge variant="outline" title={title} className="font-mono tabular-nums">
      {formatTaHandicapSeconds(value)}
    </Badge>
  );
}
