/**
 * 配信管理 (Broadcast Management) Page
 *
 * Admin page for controlling the overlay player name display.
 * Shows the 1P/2P names currently on the OBS overlay and lets the admin:
 * - Pick player names from a searchable list
 * - Type custom names directly
 * - Preview the current overlay state
 *
 * Positions for the overlay are fixed in the scene:
 *   1P: x:80, y:480, width:230px, height:48px
 *   2P: x:80, y:870, width:230px, height:48px
 */
"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Player {
  id: string;
  name: string;
  nickname: string;
}

interface BroadcastState {
  player1Name: string;
  player2Name: string;
}

export default function BroadcastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = use(params);
  const { data: session } = useSession();
  const isAdmin = session?.user && session.user.role === "admin";
  const t = useTranslations("common");

  const [currentState, setCurrentState] = useState<BroadcastState>({ player1Name: "", player2Name: "" });
  const [player1Input, setPlayer1Input] = useState("");
  const [player2Input, setPlayer2Input] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const fetchBroadcastState = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/broadcast`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data ?? json;
        setCurrentState({ player1Name: data.player1Name ?? "", player2Name: data.player2Name ?? "" });
        setPlayer1Input(data.player1Name ?? "");
        setPlayer2Input(data.player2Name ?? "");
      }
    } catch { /* silent */ }
  }, [tournamentId]);

  useEffect(() => {
    fetchBroadcastState();
    /* Fetch player list for the dropdown */
    fetch("/api/players")
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        const data = json?.data ?? json;
        if (Array.isArray(data)) {
          setPlayers(data.filter((p: Player) => !("deletedAt" in p) || !p.deletedAt).map((p: Player) => ({
            id: p.id,
            name: p.name,
            nickname: p.nickname,
          })));
        }
      })
      .catch(() => { /* silent */ });
  }, [fetchBroadcastState]);

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/broadcast`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player1Name: player1Input.trim(), player2Name: player2Input.trim() }),
      });
      if (res.ok) {
        await fetchBroadcastState();
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      await fetch(`/api/tournaments/${tournamentId}/broadcast`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player1Name: "", player2Name: "" }),
      });
      setPlayer1Input("");
      setPlayer2Input("");
      await fetchBroadcastState();
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t("noPermission")}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold">📺 配信管理</h2>
        <p className="text-muted-foreground text-sm mt-1">
          オーバーレイに表示する1P/2Pの名前を設定します。
        </p>
      </div>

      {/* Current overlay state preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">現在の配信表示</CardTitle>
          <CardDescription>OBSオーバーレイに現在表示されている名前</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-6">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">1P (x:80, y:480)</p>
            <p className={`font-bold text-lg ${currentState.player1Name ? "" : "text-muted-foreground"}`}>
              {currentState.player1Name || "（未設定）"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">2P (x:80, y:870)</p>
            <p className={`font-bold text-lg ${currentState.player2Name ? "" : "text-muted-foreground"}`}>
              {currentState.player2Name || "（未設定）"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Name input form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">名前を設定</CardTitle>
          <CardDescription>
            プレイヤーリストから選ぶか、直接入力してください。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>1P 名前</Label>
            {/* Player selector dropdown */}
            {players.length > 0 && (
              <Select
                onValueChange={(val) => setPlayer1Input(val)}
                value=""
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="プレイヤーリストから選択..." />
                </SelectTrigger>
                <SelectContent>
                  {players.map((p) => (
                    <SelectItem key={p.id} value={p.nickname}>
                      {p.nickname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              value={player1Input}
              onChange={(e) => setPlayer1Input(e.target.value)}
              placeholder="1P の名前を入力..."
              maxLength={50}
            />
          </div>
          <div className="space-y-2">
            <Label>2P 名前</Label>
            {players.length > 0 && (
              <Select
                onValueChange={(val) => setPlayer2Input(val)}
                value=""
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="プレイヤーリストから選択..." />
                </SelectTrigger>
                <SelectContent>
                  {players.map((p) => (
                    <SelectItem key={p.id} value={p.nickname}>
                      {p.nickname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              value={player2Input}
              onChange={(e) => setPlayer2Input(e.target.value)}
              placeholder="2P の名前を入力..."
              maxLength={50}
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className={savedFlash ? "bg-green-600 hover:bg-green-600" : ""}
            >
              {savedFlash ? "✓ 反映しました" : "配信に反映"}
            </Button>
            <Button variant="outline" onClick={handleClear} disabled={saving}>
              クリア
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        <p>
          オーバーレイURL:{" "}
          <Link
            href={`/tournaments/${tournamentId}/overlay/dashboard`}
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            /tournaments/{tournamentId}/overlay/dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
