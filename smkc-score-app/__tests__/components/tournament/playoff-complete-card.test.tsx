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

  it("keeps the default complete-state styling when callers provide only additional layout classes", () => {
    render(
      <PlayoffCompleteCard
        className="mt-4"
        description="The playoff is complete."
        actionLabel="Create Upper Bracket"
        onCreateUpperBracket={jest.fn()}
      />,
    );

    const card = screen.getByText("The playoff is complete.").closest(".mt-4");

    expect(card).toHaveClass("border-green-500/50");
    expect(card).toHaveClass("bg-green-500/10");
  });

  it("does not drop the default complete-state styling when className is empty", () => {
    render(
      <PlayoffCompleteCard
        className=""
        description="The playoff is complete with empty classes."
        actionLabel="Create Upper Bracket"
        onCreateUpperBracket={jest.fn()}
      />,
    );

    const card = screen.getByText("The playoff is complete with empty classes.").closest(".border-green-500\\/50");

    expect(card).toHaveClass("bg-green-500/10");
  });
});
