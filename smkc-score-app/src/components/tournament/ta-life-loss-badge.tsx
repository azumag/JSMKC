import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';

export function TaLifeLossBadge({ count }: { count: number }) {
  const tTaFinals = useTranslations('taFinals');
  return (
    <Badge variant="outline" className="text-orange-600 border-orange-400 text-xs font-normal">
      {tTaFinals('lifeLossTag', { count })}
    </Badge>
  );
}
