import { memo } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TV_NUMBER_OPTIONS } from "@/lib/constants";
import {
  TA_FINALS_ROUND_CONTROLS_CLASS,
  TA_FINALS_ROUND_ENTRY_ROW_CLASS,
  TA_FINALS_ROUND_PLAYER_LABEL_CLASS,
  TA_FINALS_ROUND_PLAYER_NAME_CLASS,
  TA_FINALS_TIME_INPUT_CLASS,
  type TaTimeInputProps,
  parseTvNumberInput,
} from "@/lib/ta/time-entry-layout";

type TaTimeEntryRowProps = {
  playerId: string;
  playerName: string;
  /** Optional lives indicator: finals phase renders heart icons, elimination phases omit it. */
  livesLabel?: ReactNode;
  tvNumber: number | null;
  tvLabel: string;
  timeValue: string;
  timePlaceholder: string;
  isRetry: boolean;
  isEditingDisabled: boolean;
  retryLabel: string;
  retryTitle: string;
  timeInputProps: TaTimeInputProps;
  onTvChange: (playerId: string, value: number | null) => void;
  onTimeChange: (playerId: string, value: string) => void;
  onTimeBlur: (playerId: string) => void;
  onRetryToggle: (playerId: string) => void;
};

export const TaTimeEntryRow = memo(function TaTimeEntryRow({
  playerId,
  playerName,
  livesLabel,
  tvNumber,
  tvLabel,
  timeValue,
  timePlaceholder,
  isRetry,
  isEditingDisabled,
  retryLabel,
  retryTitle,
  timeInputProps,
  onTvChange,
  onTimeChange,
  onTimeBlur,
  onRetryToggle,
}: TaTimeEntryRowProps) {
  return (
    <div
      className={TA_FINALS_ROUND_ENTRY_ROW_CLASS}
      data-testid="ta-time-entry-row"
    >
      <div className={TA_FINALS_ROUND_PLAYER_LABEL_CLASS}>
        <Label
          className={TA_FINALS_ROUND_PLAYER_NAME_CLASS}
          data-testid="ta-time-entry-player-name"
        >
          {playerName}
        </Label>
        {livesLabel != null && (
          <div className="text-xs text-muted-foreground">
            {livesLabel}
          </div>
        )}
      </div>
      <div
        className={TA_FINALS_ROUND_CONTROLS_CLASS}
        data-testid="ta-time-entry-controls"
      >
        <select
          className="h-9 w-full rounded border bg-background px-2 text-center text-sm sm:h-8 sm:w-16 sm:shrink-0"
          value={tvNumber ?? ""}
          onChange={(e) =>
            onTvChange(playerId, parseTvNumberInput(e.target.value))
          }
          aria-label={tvLabel}
        >
          <option value="">-</option>
          {TV_NUMBER_OPTIONS.map((n) => <option key={n} value={n}>TV{n}</option>)}
        </select>
        <Input
          type="text"
          {...timeInputProps}
          placeholder={timePlaceholder}
          value={timeValue}
          onChange={(e) =>
            onTimeChange(playerId, e.target.value)
          }
          onBlur={() => onTimeBlur(playerId)}
          disabled={isRetry}
          className={TA_FINALS_TIME_INPUT_CLASS}
        />
        {/* Retry penalty button: sets time to 9:59.990 */}
        <Button
          variant={isRetry ? "destructive" : "outline"}
          size="sm"
          onClick={() => onRetryToggle(playerId)}
          title={retryTitle}
          disabled={isEditingDisabled}
        >
          {retryLabel}
        </Button>
      </div>
    </div>
  );
});
