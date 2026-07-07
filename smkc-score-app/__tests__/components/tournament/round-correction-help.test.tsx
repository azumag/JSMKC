/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";

import { RoundCorrectionHelp } from "@/components/tournament/round-correction-help";

describe("RoundCorrectionHelp", () => {
  it("renders a closed info trigger with an accessible label, not the explanation text", () => {
    render(<RoundCorrectionHelp />);
    expect(
      screen.getByRole("button", { name: "Explain the difference between Undo and Cancel" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Undo vs\. Cancel/)).not.toBeInTheDocument();
  });

  it("shows the Undo vs. Cancel comparison when the trigger is clicked", () => {
    render(<RoundCorrectionHelp />);
    fireEvent.click(
      screen.getByRole("button", { name: "Explain the difference between Undo and Cancel" }),
    );

    expect(screen.getByText("Undo vs. Cancel — what's the difference?")).toBeInTheDocument();
    expect(
      screen.getByText(/Clears the results but keeps the same course assigned/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Deletes the round entirely and returns its course to the pool/),
    ).toBeInTheDocument();
  });

  it("labels the popover dialog with its visible title for screen readers", () => {
    render(<RoundCorrectionHelp />);
    fireEvent.click(
      screen.getByRole("button", { name: "Explain the difference between Undo and Cancel" }),
    );

    const dialog = screen.getByRole("dialog");
    const title = screen.getByText("Undo vs. Cancel — what's the difference?");
    expect(dialog).toHaveAttribute("aria-labelledby", title.id);
  });
});
