/**
 * @jest-environment jsdom
 *
 * Unit tests for the GroupSetupDialog component (TC-2929–TC-2932).
 *
 * Utility function tests (recommendGroupCount, assignGroupsBySeeding) live in
 * __tests__/lib/group-utils.test.ts — see TC-2920–TC-2928 there.
 */

import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { GroupSetupDialog } from "@/components/tournament/group-setup-dialog";
import type { SetupPlayer } from "@/lib/group-utils";
import type { ComponentProps } from "react";

/** Mirrors real usage: isOpen/setIsOpen are parent-owned state, not just a static prop. */
function ControlledGroupSetupDialog(props: ComponentProps<typeof GroupSetupDialog>) {
  const [isOpen, setIsOpen] = useState(props.isOpen);
  return <GroupSetupDialog {...props} isOpen={isOpen} setIsOpen={setIsOpen} />;
}

/* ------------------------------------------------------------------ */
/*  Shared fixtures                                                     */
/* ------------------------------------------------------------------ */

const allPlayers = [
  { id: "p1", name: "Player One", nickname: "Mario" },
  { id: "p2", name: "Player Two", nickname: "Luigi" },
];

const noSetup: SetupPlayer[] = [];

const defaultProps = {
  mode: "bm" as const,
  allPlayers,
  setupPlayers: noSetup,
  setSetupPlayers: jest.fn(),
  isOpen: false,
  setIsOpen: jest.fn(),
  onSave: jest.fn(),
  saving: false,
  error: null,
  onClearError: jest.fn(),
  existingAssignments: [],
};

/* ------------------------------------------------------------------ */
/*  TC-2929–TC-2932: GroupSetupDialog component                        */
/* ------------------------------------------------------------------ */

describe("GroupSetupDialog", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("TC-2929: renders 'Setup Groups' trigger button when no existing assignments", () => {
    render(<GroupSetupDialog {...defaultProps} existingAssignments={[]} />);

    expect(screen.getByRole("button", { name: /Setup Groups/i })).toBeInTheDocument();
  });

  it("TC-2930: renders 'Edit Groups' trigger button when existing assignments are present", () => {
    const existing: SetupPlayer[] = [
      { playerId: "p1", group: "A" },
      { playerId: "p2", group: "B" },
    ];
    render(<GroupSetupDialog {...defaultProps} existingAssignments={existing} />);

    expect(screen.getByRole("button", { name: /Edit Groups/i })).toBeInTheDocument();
  });

  it("TC-2931: trigger button has 'default' variant for new setup and 'outline' for edit mode", () => {
    const { rerender } = render(
      <GroupSetupDialog {...defaultProps} existingAssignments={[]} />,
    );
    const newBtn = screen.getByRole("button", { name: /Setup Groups/i });
    // Use data-variant instead of CSS class names to avoid coupling to shadcn/Tailwind internals
    expect(newBtn).toHaveAttribute("data-variant", "default");

    const existing: SetupPlayer[] = [{ playerId: "p1", group: "A" }];
    rerender(<GroupSetupDialog {...defaultProps} existingAssignments={existing} />);
    const editBtn = screen.getByRole("button", { name: /Edit Groups/i });
    expect(editBtn).toHaveAttribute("data-variant", "outline");
  });

  it("TC-2932: renders trigger button for all supported modes without errors", () => {
    // defaultProps has existingAssignments: [] so the trigger button reads "Setup Groups"
    const modes: Array<"bm" | "mr" | "gp"> = ["bm", "mr", "gp"];
    for (const mode of modes) {
      const { unmount } = render(
        <GroupSetupDialog {...defaultProps} mode={mode} />,
      );
      // Named query avoids ambiguity when additional buttons are added to the component
      expect(screen.getByRole("button", { name: /Setup Groups/i })).toBeInTheDocument();
      unmount();
    }
  });

  /* ---------------------------------------------------------------- */
  /*  TC-3010: group count selector (2/3), reversing the LOCKED_GROUP_COUNT
   *  restriction from issue #1007/#1678/#1680/#1682.                   */
  /* ---------------------------------------------------------------- */

  it("TC-3010: defaults to group count 2 selected, with 3 available as a clickable option", () => {
    render(<GroupSetupDialog {...defaultProps} isOpen={true} />);

    const twoBtn = screen.getByRole("button", { name: "2" });
    const threeBtn = screen.getByRole("button", { name: "3" });
    expect(twoBtn).toHaveAttribute("data-variant", "default");
    expect(twoBtn).not.toBeDisabled();
    expect(threeBtn).toHaveAttribute("data-variant", "outline");
    expect(threeBtn).not.toBeDisabled();
  });

  it("TC-3010: reducing group count confirms before reassigning group-C players", () => {
    const setSetupPlayers = jest.fn();
    render(
      <GroupSetupDialog
        {...defaultProps}
        isOpen={true}
        setupPlayers={[{ playerId: "p1", group: "C" }]}
        setSetupPlayers={setSetupPlayers}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(screen.getByRole("button", { name: "3" })).toHaveAttribute("data-variant", "default");
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("data-variant", "outline");
    // Group C is valid under 3 groups, so no assignment changes are made.
    expect(setSetupPlayers).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(setSetupPlayers).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Reassign Players/i }));
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("data-variant", "default");
    // Group C no longer exists under 2 groups -- it is reassigned only after confirmation.
    expect(setSetupPlayers).toHaveBeenLastCalledWith([{ playerId: "p1", group: "B" }]);
  });

  it("TC-3010: cancelling a group-count reduction preserves the assignments", () => {
    const setSetupPlayers = jest.fn();
    render(
      <GroupSetupDialog
        {...defaultProps}
        isOpen={true}
        setupPlayers={[{ playerId: "p1", group: "C" }]}
        setSetupPlayers={setSetupPlayers}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3" })).toHaveAttribute("data-variant", "default");
    expect(setSetupPlayers).not.toHaveBeenCalled();
  });

  it("TC-3010: closing the dialog clears a pending group-count reduction", () => {
    render(
      <ControlledGroupSetupDialog
        {...defaultProps}
        isOpen={true}
        setupPlayers={[{ playerId: "p1", group: "C" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    const closeButton = document.querySelector('[data-slot="dialog-close"]');
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);
    fireEvent.click(screen.getByRole("button", { name: /Setup Groups/i }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("TC-3010: edit mode infers group count 3 from existing assignments spanning A/B/C", () => {
    const existing: SetupPlayer[] = [
      { playerId: "p1", group: "A" },
      { playerId: "p2", group: "B" },
      { playerId: "p3", group: "C" },
    ];
    render(<ControlledGroupSetupDialog {...defaultProps} isOpen={false} existingAssignments={existing} />);

    fireEvent.click(screen.getByRole("button", { name: /Edit Groups/i }));

    expect(screen.getByRole("button", { name: "3" })).toHaveAttribute("data-variant", "default");
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("data-variant", "outline");
  });

  it("TC-3010: edit mode infers group count 2 from existing assignments spanning only A/B", () => {
    const existing: SetupPlayer[] = [
      { playerId: "p1", group: "A" },
      { playerId: "p2", group: "B" },
    ];
    render(<ControlledGroupSetupDialog {...defaultProps} isOpen={false} existingAssignments={existing} />);

    fireEvent.click(screen.getByRole("button", { name: /Edit Groups/i }));

    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("data-variant", "default");
    expect(screen.getByRole("button", { name: "3" })).toHaveAttribute("data-variant", "outline");
  });

  it('renders a setup error without clearing the selected players', () => {
    const setSetupPlayers = jest.fn();
    render(
      <GroupSetupDialog
        {...defaultProps}
        isOpen={true}
        setupPlayers={[{ playerId: 'p1', group: 'A', seeding: 1 }]}
        setSetupPlayers={setSetupPlayers}
        error="networkError"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('networkError');
    expect(screen.getByText('Mario')).toBeInTheDocument();
    expect(setSetupPlayers).not.toHaveBeenCalled();
  });

  it('disables editing and refuses to close while a setup save is in flight', () => {
    render(
      <ControlledGroupSetupDialog
        {...defaultProps}
        isOpen={true}
        saving={true}
        setupPlayers={[{ playerId: 'p1', group: 'A', seeding: 1 }]}
      />,
    );

    expect(screen.getByRole('button', { name: /Saving/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: '2' })).toBeDisabled();
    expect(screen.getByPlaceholderText(/Search/i)).toBeDisabled();

    const closeButton = document.querySelector('[data-slot="dialog-close"]');
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('clears form and error state only when the administrator explicitly closes', () => {
    const setSetupPlayers = jest.fn();
    const onClearError = jest.fn();
    render(
      <ControlledGroupSetupDialog
        {...defaultProps}
        isOpen={true}
        setupPlayers={[{ playerId: 'p1', group: 'A' }]}
        setSetupPlayers={setSetupPlayers}
        error="networkError"
        onClearError={onClearError}
      />,
    );

    const closeButton = document.querySelector('[data-slot="dialog-close"]');
    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);

    expect(setSetupPlayers).toHaveBeenCalledWith([]);
    expect(onClearError).toHaveBeenCalledTimes(1);
  });
});
