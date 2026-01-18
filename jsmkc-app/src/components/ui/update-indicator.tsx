import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock, Loader2 } from "lucide-react";

interface UpdateIndicatorProps {
  lastUpdated: Date | null;
  isPolling: boolean;
}

export function UpdateIndicator({
  lastUpdated,
  isPolling,
}: UpdateIndicatorProps) {
  const [secondsAgo, setSecondsAgo] = useState(() => {
    if (!lastUpdated) return 0;
    return Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
  });

  useEffect(() => {
    if (!lastUpdated) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
      setSecondsAgo(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [lastUpdated]);

  const formatTimeAgo = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div className="flex items-center gap-2">
      {isPolling ? (
        <Badge variant="default" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="hidden sm:inline">Live</span>
        </Badge>
      ) : (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          <span className="hidden sm:inline">Paused</span>
        </Badge>
      )}
      {lastUpdated && (
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Last updated: {formatTimeAgo(secondsAgo)}
        </span>
      )}
    </div>
  );
}
