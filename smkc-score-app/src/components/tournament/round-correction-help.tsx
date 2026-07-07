"use client";

/**
 * RoundCorrectionHelp — a small info-icon popover explaining the difference
 * between "Undo Last Round" and "Cancel Last Round". Deliberately a separate,
 * muted trigger on its own row above the amber/red action buttons (not inline
 * with them) so it reads as informational and can't be misclicked as a third
 * destructive action.
 */
import * as React from "react";
import { Popover } from "radix-ui";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export function RoundCorrectionHelp() {
  const t = useTranslations("common");
  const titleId = React.useId();

  return (
    <div className="flex justify-end">
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("roundCorrectionHelpLabel")}
            className="text-muted-foreground"
          >
            <Info className="size-4" />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={4}
            aria-labelledby={titleId}
            className="z-50 w-72 rounded-sm border border-foreground/25 bg-popover p-3 text-sm text-popover-foreground shadow-md outline-none"
          >
            <p id={titleId} className="font-semibold">{t("roundCorrectionHelpTitle")}</p>
            <p className="mt-2">
              <span className="font-medium text-amber-700">{t("roundCorrectionHelpUndoLabel")}</span>
              {": "}
              {t("roundCorrectionHelpUndoDesc")}
            </p>
            <p className="mt-2">
              <span className="font-medium text-red-700">{t("roundCorrectionHelpCancelLabel")}</span>
              {": "}
              {t("roundCorrectionHelpCancelDesc")}
            </p>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
