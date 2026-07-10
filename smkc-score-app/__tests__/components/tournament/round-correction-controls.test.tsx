/** @jest-environment jsdom */

import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { RoundCorrectionControls } from "@/components/tournament/round-correction-controls";

const labels = {
  undoLastRound: "Undo Last Round",
  cancelLastRound: "Cancel Last Round",
  undoRoundTitle: "Undo round?",
  undoRoundDesc: "Keep the course and clear its results.",
  cancelLastRoundTitle: "Cancel round?",
  cancelLastRoundDesc: "Clear the results and free the course.",
  keepRound: "Keep Round",
  undoing: "Undoing...",
  yesUndoRound: "Yes, Undo",
  cancellingLastRound: "Cancelling...",
  yesCancelLastRound: "Yes, Cancel",
};

function Harness({ onUndoRound = jest.fn(), onCancelLastRound = jest.fn() }) {
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  return (
    <RoundCorrectionControls
      labels={labels}
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

describe("RoundCorrectionControls", () => {
  it("opens the undo confirmation and delegates the confirmed action", () => {
    const onUndoRound = jest.fn();
    render(<Harness onUndoRound={onUndoRound} />);

    fireEvent.click(screen.getByRole("button", { name: labels.undoLastRound }));
    expect(screen.getByRole("heading", { name: labels.undoRoundTitle })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: labels.yesUndoRound }));
    expect(onUndoRound).toHaveBeenCalledTimes(1);
  });

  it("opens the cancel confirmation and delegates the confirmed action", () => {
    const onCancelLastRound = jest.fn();
    render(<Harness onCancelLastRound={onCancelLastRound} />);

    fireEvent.click(screen.getByRole("button", { name: labels.cancelLastRound }));
    expect(screen.getByRole("heading", { name: labels.cancelLastRoundTitle })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: labels.yesCancelLastRound }));
    expect(onCancelLastRound).toHaveBeenCalledTimes(1);
  });

  it("disables both correction actions while another round operation is active", () => {
    render(
      <RoundCorrectionControls
        labels={labels}
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

    expect(screen.getByRole("button", { name: labels.undoLastRound })).toBeDisabled();
    expect(screen.getByRole("button", { name: labels.cancelLastRound })).toBeDisabled();
  });
});
