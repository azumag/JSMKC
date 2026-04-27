"use client";

/**
 * Admin-only button that calls POST /api/tournaments/:id/{mode}/debug-fill
 * to auto-fill empty qualification scores. Only rendered on tournaments
 * created with `debugMode = true`.
 *
 * Each qualification page (BM/MR/GP/TA) renders this once next to the
 * existing admin controls (Setup / Confirm). The button is hidden entirely
 * when `debugMode` is false, so it never appears for normal tournaments.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface DebugFillButtonProps {
  tournamentId: string;
  mode: "bm" | "mr" | "gp" | "ta";
  /** Called after a successful fill so the parent can refetch standings. */
  onFilled?: () => void;
  className?: string;
}

export function DebugFillButton({
  tournamentId,
  mode,
  onFilled,
  className,
}: DebugFillButtonProps) {
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setStatusText("実行中…");
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/${mode}/debug-fill`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = json?.error || `HTTP ${res.status}`;
        setStatusText(`失敗: ${msg}`);
        return;
      }
      const data = json?.data ?? json;
      const filled = typeof data?.filled === "number" ? data.filled : 0;
      const skipped = typeof data?.skipped === "number" ? data.skipped : 0;
      setStatusText(`完了: ${filled} 件入力 / ${skipped} 件スキップ`);
      onFilled?.();
    } catch (err) {
      setStatusText(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="secondary"
        onClick={handleClick}
        disabled={busy}
        title={`${mode.toUpperCase()} 予選スコアを自動入力 (debug mode)`}
      >
        {busy ? "自動入力中…" : "予選スコア自動入力"}
      </Button>
      {statusText && (
        <p className="text-xs text-muted-foreground mt-1">{statusText}</p>
      )}
    </div>
  );
}
