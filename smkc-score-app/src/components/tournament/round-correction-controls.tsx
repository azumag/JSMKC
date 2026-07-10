"use client";

import { RoundCorrectionHelp } from "@/components/tournament/round-correction-help";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface RoundCorrectionLabels {
  undoLastRound: string;
  cancelLastRound: string;
  undoRoundTitle: string;
  undoRoundDesc: string;
  cancelLastRoundTitle: string;
  cancelLastRoundDesc: string;
  keepRound: string;
  undoing: string;
  yesUndoRound: string;
  cancellingLastRound: string;
  yesCancelLastRound: string;
}

interface RoundCorrectionControlsProps {
  labels: RoundCorrectionLabels;
  actionsDisabled: boolean;
  undoingRound: boolean;
  cancellingLastRound: boolean;
  showUndoConfirm: boolean;
  onShowUndoConfirmChange: (open: boolean) => void;
  showCancelConfirm: boolean;
  onShowCancelConfirmChange: (open: boolean) => void;
  onUndoRound: () => void | Promise<void>;
  onCancelLastRound: () => void | Promise<void>;
}

/**
 * Shared controls for correcting the latest completed TA round.
 *
 * The caller owns request state because undo/cancel API behavior differs by TA
 * phase. This component owns only the duplicated presentation and delegates
 * every state transition and confirmed action through controlled props.
 */
export function RoundCorrectionControls({
  labels,
  actionsDisabled,
  undoingRound,
  cancellingLastRound,
  showUndoConfirm,
  onShowUndoConfirmChange,
  showCancelConfirm,
  onShowCancelConfirmChange,
  onUndoRound,
  onCancelLastRound,
}: RoundCorrectionControlsProps) {
  return (
    <>
      <RoundCorrectionHelp />
      <Button
        variant="outline"
        className="w-full text-amber-700 border-amber-400 hover:bg-amber-50"
        onClick={() => onShowUndoConfirmChange(true)}
        disabled={actionsDisabled}
      >
        {labels.undoLastRound}
      </Button>
      <Button
        variant="outline"
        className="w-full text-red-700 border-red-400 hover:bg-red-50"
        onClick={() => onShowCancelConfirmChange(true)}
        disabled={actionsDisabled}
      >
        {labels.cancelLastRound}
      </Button>

      <Dialog open={showUndoConfirm} onOpenChange={onShowUndoConfirmChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.undoRoundTitle}</DialogTitle>
            <DialogDescription>{labels.undoRoundDesc}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onShowUndoConfirmChange(false)} disabled={undoingRound}>
              {labels.keepRound}
            </Button>
            <Button variant="destructive" onClick={onUndoRound} disabled={undoingRound}>
              {undoingRound ? labels.undoing : labels.yesUndoRound}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCancelConfirm} onOpenChange={onShowCancelConfirmChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.cancelLastRoundTitle}</DialogTitle>
            <DialogDescription>{labels.cancelLastRoundDesc}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onShowCancelConfirmChange(false)}
              disabled={cancellingLastRound}
            >
              {labels.keepRound}
            </Button>
            <Button variant="destructive" onClick={onCancelLastRound} disabled={cancellingLastRound}>
              {cancellingLastRound ? labels.cancellingLastRound : labels.yesCancelLastRound}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
