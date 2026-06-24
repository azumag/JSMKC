/**
 * @jest-environment jsdom
 *
 * Unit tests for the GroupSetupDialog component (TC-2929–TC-2932).
 *
 * Utility function tests (recommendGroupCount, assignGroupsBySeeding) live in
 * __tests__/lib/group-utils.test.ts — see TC-2920–TC-2928 there.
 */

import { render, screen } from "@testing-library/react";
import { GroupSetupDialog } from "@/components/tournament/group-setup-dialog";
import type { SetupPlayer } from "@/lib/group-utils";

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
    // default variant has bg-primary class
    expect(newBtn.className).toMatch(/bg-primary/);

    const existing: SetupPlayer[] = [{ playerId: "p1", group: "A" }];
    rerender(<GroupSetupDialog {...defaultProps} existingAssignments={existing} />);
    const editBtn = screen.getByRole("button", { name: /Edit Groups/i });
    // outline variant has border-input or bg-background class (no bg-primary)
    expect(editBtn.className).not.toMatch(/\bbg-primary\b/);
  });

  it("TC-2932: renders for all supported modes without errors", () => {
    const modes: Array<"bm" | "mr" | "gp"> = ["bm", "mr", "gp"];
    for (const mode of modes) {
      const { unmount } = render(
        <GroupSetupDialog {...defaultProps} mode={mode} />,
      );
      expect(screen.getByRole("button")).toBeInTheDocument();
      unmount();
    }
  });
});
