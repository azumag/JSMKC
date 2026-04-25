"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useModePublish } from "@/hooks/use-mode-publish";
import type { RevealableMode } from "@/lib/public-modes";

interface ModePublishSwitchProps {
  tournamentId: string;
  mode: RevealableMode;
  /** i18n key inside the `common` namespace identifying the mode label (e.g. "battleMode"). */
  modeLabelKey: string;
}

/**
 * Per-mode publish/unpublish toggle (issue #618).
 *
 * Rendered next to the player-setup dialog on each mode page. Each mode
 * publishes/unpublishes independently — toggling one mode does not affect
 * any other mode.
 */
export function ModePublishSwitch({
  tournamentId,
  mode,
  modeLabelKey,
}: ModePublishSwitchProps) {
  const tc = useTranslations("common");
  const { isPublic, toggle, updating, loading } = useModePublish(
    tournamentId,
    mode
  );

  const stateLabel = isPublic ? tc("publishMode") : tc("unpublishMode");
  const ariaLabel = `${tc(modeLabelKey)}: ${stateLabel}`;

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={isPublic}
        onCheckedChange={toggle}
        disabled={updating || loading}
        aria-label={ariaLabel}
      />
      <Badge variant={isPublic ? "default" : "secondary"} className="text-xs">
        {stateLabel}
      </Badge>
    </div>
  );
}
