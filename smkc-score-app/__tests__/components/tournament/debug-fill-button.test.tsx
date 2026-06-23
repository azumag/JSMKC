/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DebugFillButton } from "@/components/tournament/debug-fill-button";

describe("DebugFillButton", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("TC-2687: renders button with correct mode-specific title", () => {
    render(<DebugFillButton tournamentId="t-1" mode="bm" />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("title", "BM 予選スコアを自動入力 (debug mode)");
    expect(btn).toHaveTextContent("予選スコア自動入力");
  });

  it("TC-2688: shows 実行中… while the fetch is in-flight", async () => {
    let resolve!: (r: Response) => void;
    global.fetch = jest.fn(
      () =>
        new Promise<Response>((res) => {
          resolve = res;
        }),
    );

    render(<DebugFillButton tournamentId="t-1" mode="ta" />);
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("実行中…")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();

    resolve(new Response(JSON.stringify({ filled: 5, skipped: 2 }), { status: 200 }));
    // Verify button is re-enabled after finally block completes
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
    expect(screen.queryByText("実行中…")).toBeNull();
  });

  it("TC-2689: prevents duplicate clicks while a request is in-flight", async () => {
    let resolve!: (r: Response) => void;
    global.fetch = jest.fn(
      () =>
        new Promise<Response>((res) => {
          resolve = res;
        }),
    );

    render(<DebugFillButton tournamentId="t-1" mode="gp" />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    // Verify disabled state is set before additional clicks
    expect(btn).toBeDisabled();
    // Note: fireEvent bypasses disabled; the if(busy) guard is the real prevention mechanism
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolve(new Response(JSON.stringify({ filled: 0, skipped: 0 }), { status: 200 }));
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("TC-2690: calls the correct debug-fill endpoint on click", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ filled: 3, skipped: 0 }), { status: 200 }),
    );

    render(<DebugFillButton tournamentId="tourney-42" mode="mr" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tournaments/tourney-42/mr/debug-fill",
        { method: "POST" },
      ),
    );
  });

  it("TC-2691: shows success status with filled/skipped counts", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ filled: 12, skipped: 3 }), { status: 200 }),
    );

    render(<DebugFillButton tournamentId="t-1" mode="bm" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(screen.getByText("完了: 12 件入力 / 3 件スキップ")).toBeInTheDocument(),
    );
  });

  it("TC-2692: calls onFilled callback after successful API response", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ filled: 5, skipped: 0 }), { status: 200 }),
    );
    const onFilled = jest.fn();

    render(<DebugFillButton tournamentId="t-1" mode="bm" onFilled={onFilled} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(onFilled).toHaveBeenCalledTimes(1));
  });

  it("TC-2693: shows failure message with server error text on non-ok response", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Not enough players" }), { status: 400 }),
    );

    render(<DebugFillButton tournamentId="t-1" mode="ta" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(screen.getByText("失敗: Not enough players")).toBeInTheDocument(),
    );
  });

  it("TC-2694: shows error message and re-enables button when fetch throws", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network down"));

    render(<DebugFillButton tournamentId="t-1" mode="gp" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(screen.getByText("エラー: Network down")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("TC-2695: shows 0 件 when filled/skipped fields are missing from the response", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    render(<DebugFillButton tournamentId="t-1" mode="bm" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(screen.getByText("完了: 0 件入力 / 0 件スキップ")).toBeInTheDocument(),
    );
  });
});
