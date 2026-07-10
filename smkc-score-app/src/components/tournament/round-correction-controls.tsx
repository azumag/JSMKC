'use client';

import { RoundCorrectionHelp } from '@/components/tournament/round-correction-help';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type RoundCorrectionLabelKey =
  | 'undoLastRound'
  | 'cancelLastRound'
  | 'undoRoundTitle'
  | 'undoRoundDesc'
  | 'cancelLastRoundTitle'
  | 'cancelLastRoundDesc'
  | 'keepRound'
  | 'undoing'
  | 'yesUndoRound'
  | 'cancellingLastRound'
  | 'yesCancelLastRound';

interface RoundCorrectionControlsProps {
  translate: (key: RoundCorrectionLabelKey) => string;
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
  translate,
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
        {translate('undoLastRound')}
      </Button>
      <Button
        variant="outline"
        className="w-full text-red-700 border-red-400 hover:bg-red-50"
        onClick={() => onShowCancelConfirmChange(true)}
        disabled={actionsDisabled}
      >
        {translate('cancelLastRound')}
      </Button>

      <Dialog open={showUndoConfirm} onOpenChange={onShowUndoConfirmChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate('undoRoundTitle')}</DialogTitle>
            <DialogDescription>{translate('undoRoundDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onShowUndoConfirmChange(false)} disabled={undoingRound}>
              {translate('keepRound')}
            </Button>
            <Button variant="destructive" onClick={onUndoRound} disabled={undoingRound}>
              {undoingRound ? translate('undoing') : translate('yesUndoRound')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCancelConfirm} onOpenChange={onShowCancelConfirmChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate('cancelLastRoundTitle')}</DialogTitle>
            <DialogDescription>{translate('cancelLastRoundDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onShowCancelConfirmChange(false)} disabled={cancellingLastRound}>
              {translate('keepRound')}
            </Button>
            <Button variant="destructive" onClick={onCancelLastRound} disabled={cancellingLastRound}>
              {cancellingLastRound ? translate('cancellingLastRound') : translate('yesCancelLastRound')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
