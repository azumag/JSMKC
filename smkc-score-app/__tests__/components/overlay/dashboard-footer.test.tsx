/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { DashboardFooter } from "@/components/overlay/dashboard-footer";

describe("DashboardFooter", () => {
  it("TC-2681: renders with data-testid dashboard-footer", () => {
    render(<DashboardFooter currentPhase="Qualification" />);
    expect(screen.getByTestId("dashboard-footer")).toBeInTheDocument();
  });

  it("TC-2682: shows currentPhase as the label text", () => {
    render(<DashboardFooter currentPhase="Time Attack Phase 1 Round 3" />);
    expect(screen.getByTestId("dashboard-footer")).toHaveTextContent(
      "Time Attack Phase 1 Round 3",
    );
  });

  it("TC-2683: overlayMatchLabel overrides currentPhase when non-empty", () => {
    render(
      <DashboardFooter
        currentPhase="Qualification"
        overlayMatchLabel="Finals Winners Quarter Final"
      />,
    );
    const footer = screen.getByTestId("dashboard-footer");
    expect(footer).toHaveTextContent("Finals Winners Quarter Final");
    expect(footer).not.toHaveTextContent("Qualification");
  });

  it("TC-2684: shows currentPhaseFormat badge when provided", () => {
    render(<DashboardFooter currentPhase="Finals" currentPhaseFormat="First to 5" />);
    expect(screen.getByTestId("dashboard-footer-ft")).toHaveTextContent("First to 5");
  });

  it("TC-2685: does not render currentPhaseFormat badge when not provided", () => {
    render(<DashboardFooter currentPhase="Qualification" />);
    expect(screen.queryByTestId("dashboard-footer-ft")).toBeNull();
  });

  it("TC-2686: empty-string overlayMatchLabel falls back to currentPhase", () => {
    render(
      <DashboardFooter
        currentPhase="Finals Winners Semi Final"
        overlayMatchLabel=""
      />,
    );
    expect(screen.getByTestId("dashboard-footer")).toHaveTextContent(
      "Finals Winners Semi Final",
    );
  });
});
