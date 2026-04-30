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
  noCamera?: boolean;
}

interface BroadcastState {
  player1Name: string;
  player2Name: string;
  player1NoCamera: boolean;
  player2NoCamera: boolean;
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

  const [currentState, setCurrentState] = useState<BroadcastState>({
    player1Name: "",
    player2Name: "",
    player1NoCamera: false,
    player2NoCamera: false,
  });
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
        setCurrentState({
          player1Name: data.player1Name ?? "",
          player2Name: data.player2Name ?? "",
          player1NoCamera: data.player1NoCamera === true,
          player2NoCamera: data.player2NoCamera === true,
        });
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
            noCamera: p.noCamera === true,
          })));
        }
      })
      .catch(() => { /* silent */ });
  }, [fetchBroadcastState]);

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    const player1 = players.find((p) => p.nickname === player1Input.trim());
    const player2 = players.find((p) => p.nickname === player2Input.trim());
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/broadcast`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player1Name: player1Input.trim(),
          player2Name: player2Input.trim(),
          player1NoCamera: player1?.noCamera === true,
          player2NoCamera: player2?.noCamera === true,
        }),
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
        body: JSON.stringify({
          player1Name: "",
          player2Name: "",
          player1NoCamera: false,
          player2NoCamera: false,
        }),
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
    <div className="space-y-7 max-w-3xl">
      <header className="border-b border-foreground/15 pb-4">
        <h2 className="font-display text-3xl tracking-wide leading-none">
          配信管理
        </h2>
        <p className="text-muted-foreground text-sm mt-2">
          オーバーレイに表示する1P/2Pの名前を設定します。
        </p>
      </header>

      {/* Current overlay state preview */}
      <section className="border border-foreground/15">
        <div className="px-5 pt-4 pb-1">
          <p className="text-sm font-semibold">現在の配信表示</p>
          <p className="text-xs text-muted-foreground mt-0.5">OBSオーバーレイに現在表示されている名前</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-foreground/10">
          {[
            {
              slot: "1P",
              coords: "x:80, y:485",
              value: currentState.player1Name,
              noCamera: currentState.player1NoCamera,
            },
            {
              slot: "2P",
              coords: "x:80, y:875",
              value: currentState.player2Name,
              noCamera: currentState.player2NoCamera,
            },
          ].map((p) => (
            <div key={p.slot} className="p-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-mono mb-2">
                <span className="font-semibold text-foreground">{p.slot}</span>
                <span>{p.coords}</span>
              </div>
              <p className={`text-2xl font-semibold ${p.value ? "" : "text-muted-foreground"}`}>
                {p.value || "未設定"}
              </p>
              {p.noCamera && (
                <p className="mt-1 text-xs font-semibold text-yellow-600">No camera</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Name input form */}
      <section className="border border-foreground/15 p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold">名前を設定</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            プレイヤーリストから選ぶか、直接入力してください。
          </p>
        </div>
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
      </section>

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
