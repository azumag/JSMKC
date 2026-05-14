/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { PlayoffCompleteCard } from "@/components/tournament/playoff-complete-card";

describe("PlayoffCompleteCard", () => {
  it("renders the shared Phase-2 message and invokes the upper-bracket action", () => {
    const onCreateUpperBracket = jest.fn();

    render(
      <PlayoffCompleteCard
        description="All playoff matches complete! Create the upper bracket to continue."
        actionLabel="Create Upper Bracket"
        onCreateUpperBracket={onCreateUpperBracket}
      />,
    );

    expect(screen.getByText("All playoff matches complete! Create the upper bracket to continue.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create Upper Bracket" }));

    expect(onCreateUpperBracket).toHaveBeenCalledTimes(1);
  });

  it("preserves the tab-panel spacing class when rendered below a playoff bracket", () => {
    render(
      <PlayoffCompleteCard
        className="mt-4 border-green-500/50 bg-green-500/10"
        description="全プレーオフ試合が完了しました！上位ブラケットを作成してください。"
        actionLabel="上位ブラケット作成"
        onCreateUpperBracket={jest.fn()}
      />,
    );

    expect(screen.getByText("全プレーオフ試合が完了しました！上位ブラケットを作成してください。").closest(".mt-4")).toBeInTheDocument();
  });
});
