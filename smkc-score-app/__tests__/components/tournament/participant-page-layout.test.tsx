/**
 * @jest-environment jsdom
 *
 * Unit tests for the ParticipantPageLayout component (TC-2705 through TC-2718).
 *
 * ParticipantPageLayout provides a shared structure for BM/MR/GP participant pages,
 * covering multiple distinct UI states: loading, auth-blocked, no-access, not-found,
 * error, empty matches, pending/completed match sections, qualification lock, and
 * render-prop injection.
 */
import { render, screen } from "@testing-library/react";
import { ParticipantPageLayout } from "@/components/tournament/participant-page-layout";
import type { BaseMatch, ParticipantTournament } from "@/lib/hooks/useParticipantMatches";
import { Trophy } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Test fixtures                                                       */
/* ------------------------------------------------------------------ */

const tournament: ParticipantTournament = {
  id: "t-1",
  name: "SMKC 2026",
  date: "2026-06-01",
  status: "active",
};

const player1 = { id: "p-1", name: "Player One", nickname: "Mario" };
const player2 = { id: "p-2", name: "Player Two", nickname: "Luigi" };

function makeMatch(overrides: Partial<BaseMatch> = {}): BaseMatch {
  return {
    id: "m-1",
    matchNumber: 1,
    stage: "qualification",
    tvNumber: 3,
    player1,
    player1Side: 1,
    player2,
    player2Side: 2,
    completed: false,
    ...overrides,
  };
}

const defaultProps = {
  mode: "bm" as const,
  sectionIcon: Trophy,
  noPendingKey: "noPendingBM",
  sessionStatus: "authenticated",
  hasAccess: true,
  isAdminBlocked: false,
  loading: false,
  tournament,
  session: { user: { nickname: "Mario" } },
  error: null,
  myMatches: [] as BaseMatch[],
  tournamentId: "t-1",
  playerId: "p-1",
  submitting: null,
  renderMatchForm: jest.fn(() => <div data-testid="match-form" />),
  renderPreviousReports: jest.fn(() => <div data-testid="prev-reports" />),
};

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  State: loading                                                      */
/* ------------------------------------------------------------------ */

describe("ParticipantPageLayout — loading", () => {
  it("TC-2705: shows loading spinner when sessionStatus is loading", () => {
    render(<ParticipantPageLayout {...defaultProps} sessionStatus="loading" />);

    expect(screen.getByText("Loading tournament data...")).toBeInTheDocument();
    // No match content visible during loading
    expect(screen.queryByText("SMKC 2026")).not.toBeInTheDocument();
  });

  it("TC-2705b: shows loading spinner when loading prop is true", () => {
    render(<ParticipantPageLayout {...defaultProps} loading={true} />);

    expect(screen.getByText("Loading tournament data...")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  State: admin blocked                                               */
/* ------------------------------------------------------------------ */

describe("ParticipantPageLayout — admin blocked", () => {
  it("TC-2706: shows admin-unavailable card when isAdminBlocked is true", () => {
    render(<ParticipantPageLayout {...defaultProps} isAdminBlocked={true} />);

    expect(screen.getByText("Admin score entry is not available here")).toBeInTheDocument();
    // Link to main mode page
    const link = screen.getByRole("link", { name: "Open main mode page" });
    expect(link).toHaveAttribute("href", "/tournaments/t-1/bm");
  });
});

/* ------------------------------------------------------------------ */
/*  State: no access (login required)                                  */
/* ------------------------------------------------------------------ */

describe("ParticipantPageLayout — no access", () => {
  it("TC-2707: shows login prompt when hasAccess is false", () => {
    render(<ParticipantPageLayout {...defaultProps} hasAccess={false} />);

    expect(screen.getByText("Player Login Required")).toBeInTheDocument();
    const loginLink = screen.getByRole("link", { name: "Log In" });
    expect(loginLink).toHaveAttribute("href", "/auth/signin");
  });
});

/* ------------------------------------------------------------------ */
/*  State: tournament not found                                        */
/* ------------------------------------------------------------------ */

describe("ParticipantPageLayout — tournament not found", () => {
  it("TC-2708: shows not-found card when tournament is null", () => {
    render(<ParticipantPageLayout {...defaultProps} tournament={null} />);

    expect(screen.getByText("Tournament Not Found")).toBeInTheDocument();
    expect(screen.getByText("The requested tournament could not be loaded")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  State: empty matches                                               */
/* ------------------------------------------------------------------ */

describe("ParticipantPageLayout — empty matches", () => {
  it("TC-2709: shows empty state when myMatches is empty", () => {
    render(<ParticipantPageLayout {...defaultProps} myMatches={[]} />);

    expect(screen.getByText("No Pending Matches")).toBeInTheDocument();
    // The noPendingKey translation is rendered
    expect(screen.getByText(/don't have any pending battle mode matches/)).toBeInTheDocument();
    // renderMatchForm and renderPreviousReports should not be called
    expect(defaultProps.renderMatchForm).not.toHaveBeenCalled();
    expect(defaultProps.renderPreviousReports).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  Match list rendering                                               */
/* ------------------------------------------------------------------ */

describe("ParticipantPageLayout — match list", () => {
  it("TC-2710: pending match appears in pending section with match number", () => {
    const match = makeMatch({ completed: false });
    render(<ParticipantPageLayout {...defaultProps} myMatches={[match]} />);

    expect(screen.getByText("Match #1")).toBeInTheDocument();
    // Pending badge visible
    expect(screen.getByText("Pending")).toBeInTheDocument();
    // renderMatchForm called for pending match
    expect(defaultProps.renderMatchForm).toHaveBeenCalledTimes(1);
    expect(defaultProps.renderMatchForm).toHaveBeenCalledWith(match);
  });

  it("TC-2711: completed match appears in completed section with green badge", () => {
    const completedMatch = makeMatch({
      id: "m-c",
      matchNumber: 2,
      completed: true,
      // Use score1/score2 for final score display
    });
    render(<ParticipantPageLayout {...defaultProps} myMatches={[completedMatch]} />);

    expect(screen.getByText("Completed")).toBeInTheDocument();
    // Completed section header shows count
    expect(screen.getByText("Completed (1)")).toBeInTheDocument();
    // renderMatchForm is NOT called for completed matches
    expect(defaultProps.renderMatchForm).not.toHaveBeenCalled();
    // renderPreviousReports IS called for completed matches
    expect(defaultProps.renderPreviousReports).toHaveBeenCalledWith(completedMatch);
  });

  it("TC-2712: error shown as destructive alert", () => {
    render(<ParticipantPageLayout {...defaultProps} error="Network error occurred" />);

    expect(screen.getByText("Network error occurred")).toBeInTheDocument();
    // Still renders main page content (tournament name, etc.)
    expect(screen.getByText("SMKC 2026")).toBeInTheDocument();
  });

  it("TC-2713: qualification confirmed replaces form with locked alert", () => {
    const match = makeMatch({ completed: false });
    render(
      <ParticipantPageLayout
        {...defaultProps}
        myMatches={[match]}
        qualificationConfirmed={true}
      />,
    );

    // Locked alert shown
    expect(screen.getByText("Qualification results are confirmed. Score editing is locked.")).toBeInTheDocument();
    // renderMatchForm NOT called when locked
    expect(defaultProps.renderMatchForm).not.toHaveBeenCalled();
  });

  it("TC-2714: renderMatchForm called for pending non-confirmed match", () => {
    const match = makeMatch({ completed: false });
    render(
      <ParticipantPageLayout
        {...defaultProps}
        myMatches={[match]}
        qualificationConfirmed={false}
      />,
    );

    expect(defaultProps.renderMatchForm).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("match-form")).toBeInTheDocument();
  });

  it("TC-2715: renderPreviousReports called for each match", () => {
    const m1 = makeMatch({ id: "m-1", matchNumber: 1, completed: false });
    const m2 = makeMatch({ id: "m-2", matchNumber: 2, completed: true });
    render(<ParticipantPageLayout {...defaultProps} myMatches={[m1, m2]} />);

    expect(defaultProps.renderPreviousReports).toHaveBeenCalledTimes(2);
    expect(defaultProps.renderPreviousReports).toHaveBeenCalledWith(m1);
    expect(defaultProps.renderPreviousReports).toHaveBeenCalledWith(m2);
  });

  it("TC-2716: renderCardHeaderExtra rendered in card header when provided", () => {
    const match = makeMatch({ completed: false });
    const renderCardHeaderExtra = jest.fn(() => <span data-testid="extra-header">GP Cup A</span>);
    render(
      <ParticipantPageLayout
        {...defaultProps}
        myMatches={[match]}
        renderCardHeaderExtra={renderCardHeaderExtra}
      />,
    );

    expect(screen.getByTestId("extra-header")).toBeInTheDocument();
    expect(renderCardHeaderExtra).toHaveBeenCalledWith(match);
  });

  it("TC-2717: current player (playerId match) shows You badge", () => {
    const match = makeMatch({ completed: false });
    // playerId matches player1
    render(<ParticipantPageLayout {...defaultProps} myMatches={[match]} playerId="p-1" />);

    // "You" badge appears once (for player1 who is the current player)
    const youBadges = screen.getAllByText("You");
    expect(youBadges).toHaveLength(1);
    // "Luigi" (player2) has no "You" badge — verify both nicknames are rendered
    expect(screen.getAllByText("Mario").length).toBeGreaterThan(0);
    expect(screen.getByText("Luigi")).toBeInTheDocument();
  });

  it("TC-2718: completed match shows final score from score1/score2 fields", () => {
    // The component reads score1/score2 (or points1/points2) via Record<string, unknown>
    const completedMatch = {
      ...makeMatch({ id: "m-f", matchNumber: 5, completed: true }),
      score1: 3,
      score2: 1,
    };
    render(<ParticipantPageLayout {...defaultProps} myMatches={[completedMatch as BaseMatch]} />);

    expect(screen.getByText("Final Score")).toBeInTheDocument();
    expect(screen.getByText("3 - 1")).toBeInTheDocument();
  });
});
