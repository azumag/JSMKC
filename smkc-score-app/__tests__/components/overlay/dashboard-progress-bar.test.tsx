/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { DashboardProgressBar } from "@/components/overlay/dashboard-progress-bar";

describe("DashboardProgressBar", () => {
  it("uses TA phase labels and highlights phase1", () => {
    render(<DashboardProgressBar currentPhase="Time Attack Phase 1 Round 2" />);

    expect(screen.getByTestId("dashboard-progress-step-barrage")).toHaveTextContent("Phase 1");
    expect(screen.getByTestId("dashboard-progress-step-finals")).toHaveTextContent("Phase 3");
    expect(screen.getByTestId("dashboard-progress-step-barrage")).toHaveClass("text-yellow-400");
  });

  it("uses TA phase labels and highlights phase2", () => {
    render(<DashboardProgressBar currentPhase="Time Attack Phase 2 Round 1" />);

    expect(screen.getByTestId("dashboard-progress-step-barrage")).toHaveTextContent("Phase 2");
    expect(screen.getByTestId("dashboard-progress-step-barrage")).toHaveClass("text-yellow-400");
  });

  it("uses TA phase labels and highlights phase3", () => {
    render(<DashboardProgressBar currentPhase="Time Attack Phase 3 Round 4" />);

    expect(screen.getByTestId("dashboard-progress-step-barrage")).toHaveTextContent("Phase 2");
    expect(screen.getByTestId("dashboard-progress-step-finals")).toHaveTextContent("Phase 3");
    expect(screen.getByTestId("dashboard-progress-step-finals")).toHaveClass("text-yellow-400");
  });

  it("keeps bracket-mode labels and highlights finals", () => {
    render(<DashboardProgressBar currentPhase="Finals Winners Quarter Final" />);

    expect(screen.getByTestId("dashboard-progress-step-barrage")).toHaveTextContent("Barrage");
    expect(screen.getByTestId("dashboard-progress-step-finals")).toHaveTextContent("Finals");
    expect(screen.getByTestId("dashboard-progress-step-finals")).toHaveClass("text-yellow-400");
  });
});
