/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { DashboardProgressBar } from "@/components/overlay/dashboard-progress-bar";

describe("DashboardProgressBar", () => {
  it("uses TA phase labels and highlights phase1", () => {
    render(<DashboardProgressBar currentPhase="TA フェーズ1 ラウンド2" />);

    expect(screen.getByTestId("dashboard-progress-step-barrage")).toHaveTextContent("フェーズ1");
    expect(screen.getByTestId("dashboard-progress-step-finals")).toHaveTextContent("フェーズ3");
    expect(screen.getByTestId("dashboard-progress-step-barrage")).toHaveClass("text-yellow-400");
  });

  it("uses TA phase labels and highlights phase2", () => {
    render(<DashboardProgressBar currentPhase="TA フェーズ2 ラウンド1" />);

    expect(screen.getByTestId("dashboard-progress-step-barrage")).toHaveTextContent("フェーズ2");
    expect(screen.getByTestId("dashboard-progress-step-barrage")).toHaveClass("text-yellow-400");
  });

  it("uses TA phase labels and highlights phase3", () => {
    render(<DashboardProgressBar currentPhase="TA フェーズ3 ラウンド4" />);

    expect(screen.getByTestId("dashboard-progress-step-barrage")).toHaveTextContent("フェーズ2");
    expect(screen.getByTestId("dashboard-progress-step-finals")).toHaveTextContent("フェーズ3");
    expect(screen.getByTestId("dashboard-progress-step-finals")).toHaveClass("text-yellow-400");
  });

  it("keeps bracket-mode labels and highlights finals", () => {
    render(<DashboardProgressBar currentPhase="BM 決勝 QF" />);

    expect(screen.getByTestId("dashboard-progress-step-barrage")).toHaveTextContent("バラッジ");
    expect(screen.getByTestId("dashboard-progress-step-finals")).toHaveTextContent("決勝");
    expect(screen.getByTestId("dashboard-progress-step-finals")).toHaveClass("text-yellow-400");
  });
});
