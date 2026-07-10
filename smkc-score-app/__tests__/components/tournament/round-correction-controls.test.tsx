/** @jest-environment jsdom */

import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { RoundCorrectionControls } from '@/components/tournament/round-correction-controls';

const labels = {
  undoLastRound: 'Undo Last Round',
  cancelLastRound: 'Cancel Last Round',
  undoRoundTitle: 'Undo round?',
  undoRoundDesc: 'Keep the course and clear its results.',
  cancelLastRoundTitle: 'Cancel round?',
  cancelLastRoundDesc: 'Clear the results and free the course.',
  keepRound: 'Keep Round',
  undoing: 'Undoing...',
  yesUndoRound: 'Yes, Undo',
  cancellingLastRound: 'Cancelling...',
  yesCancelLastRound: 'Yes, Cancel',
};
const translate = (key: keyof typeof labels) => labels[key];

function Harness({ onUndoRound = jest.fn(), onCancelLastRound = jest.fn() }) {
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  return (
    <RoundCorrectionControls
      translate={translate}
      actionsDisabled={false}
      undoingRound={false}
      cancellingLastRound={false}
      showUndoConfirm={showUndoConfirm}
      onShowUndoConfirmChange={setShowUndoConfirm}
      showCancelConfirm={showCancelConfirm}
      onShowCancelConfirmChange={setShowCancelConfirm}
      onUndoRound={onUndoRound}
      onCancelLastRound={onCancelLastRound}
    />
  );
}

describe('RoundCorrectionControls', () => {
  it('opens the undo confirmation and delegates the confirmed action', () => {
    const onUndoRound = jest.fn();
    render(<Harness onUndoRound={onUndoRound} />);

    fireEvent.click(screen.getByRole('button', { name: labels.undoLastRound }));
    expect(screen.getByRole('heading', { name: labels.undoRoundTitle })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: labels.yesUndoRound }));
    expect(onUndoRound).toHaveBeenCalledTimes(1);
  });

  it('opens the cancel confirmation and delegates the confirmed action', () => {
    const onCancelLastRound = jest.fn();
    render(<Harness onCancelLastRound={onCancelLastRound} />);

    fireEvent.click(screen.getByRole('button', { name: labels.cancelLastRound }));
    expect(screen.getByRole('heading', { name: labels.cancelLastRoundTitle })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: labels.yesCancelLastRound }));
    expect(onCancelLastRound).toHaveBeenCalledTimes(1);
  });

  it('disables both correction actions while another round operation is active', () => {
    render(
      <RoundCorrectionControls
        translate={translate}
        actionsDisabled
        undoingRound={false}
        cancellingLastRound={false}
        showUndoConfirm={false}
        onShowUndoConfirmChange={jest.fn()}
        showCancelConfirm={false}
        onShowCancelConfirmChange={jest.fn()}
        onUndoRound={jest.fn()}
        onCancelLastRound={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: labels.undoLastRound })).toBeDisabled();
    expect(screen.getByRole('button', { name: labels.cancelLastRound })).toBeDisabled();
  });

  it('shows loading labels and disables each confirmation action while it is running', () => {
    const { unmount } = render(
      <RoundCorrectionControls
        translate={translate}
        actionsDisabled
        undoingRound
        cancellingLastRound={false}
        showUndoConfirm
        onShowUndoConfirmChange={jest.fn()}
        showCancelConfirm={false}
        onShowCancelConfirmChange={jest.fn()}
        onUndoRound={jest.fn()}
        onCancelLastRound={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: labels.undoing })).toBeDisabled();
    unmount();

    render(
      <RoundCorrectionControls
        translate={translate}
        actionsDisabled
        undoingRound={false}
        cancellingLastRound
        showUndoConfirm={false}
        onShowUndoConfirmChange={jest.fn()}
        showCancelConfirm
        onShowCancelConfirmChange={jest.fn()}
        onUndoRound={jest.fn()}
        onCancelLastRound={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: labels.cancellingLastRound })).toBeDisabled();
  });

  it('closes the undo dialog without running undo when Keep Round is selected', () => {
    const onShowUndoConfirmChange = jest.fn();
    const onUndoRound = jest.fn();
    render(
      <RoundCorrectionControls
        translate={translate}
        actionsDisabled={false}
        undoingRound={false}
        cancellingLastRound={false}
        showUndoConfirm
        onShowUndoConfirmChange={onShowUndoConfirmChange}
        showCancelConfirm={false}
        onShowCancelConfirmChange={jest.fn()}
        onUndoRound={onUndoRound}
        onCancelLastRound={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: labels.keepRound }));
    expect(onShowUndoConfirmChange).toHaveBeenCalledWith(false);
    expect(onUndoRound).not.toHaveBeenCalled();
  });

  it('closes the cancel dialog without running cancel when Keep Round is selected', () => {
    const onShowCancelConfirmChange = jest.fn();
    const onCancelLastRound = jest.fn();
    render(
      <RoundCorrectionControls
        translate={translate}
        actionsDisabled={false}
        undoingRound={false}
        cancellingLastRound={false}
        showUndoConfirm={false}
        onShowUndoConfirmChange={jest.fn()}
        showCancelConfirm
        onShowCancelConfirmChange={onShowCancelConfirmChange}
        onUndoRound={jest.fn()}
        onCancelLastRound={onCancelLastRound}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: labels.keepRound }));
    expect(onShowCancelConfirmChange).toHaveBeenCalledWith(false);
    expect(onCancelLastRound).not.toHaveBeenCalled();
  });
});
