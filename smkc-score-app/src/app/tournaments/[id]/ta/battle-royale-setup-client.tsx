"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TaHandicapSelect } from "@/components/tournament/ta-handicap-select";
import { TaModeBadge } from "@/components/tournament/ta-mode-badge";
import { ModePublishSwitch } from "@/components/tournament/mode-publish-switch";
import { fetchAllPlayersForSetup } from "@/lib/qualification-page-data";
import {
  normalizeTaHandicapSeconds,
  type TaHandicapSeconds,
} from "@/lib/ta/battle-royale";
import { createLogger } from "@/lib/client-logger";

const logger = createLogger({ serviceName: "ta-battle-royale-setup" });

interface Player {
  id: string;
  name: string;
  nickname: string;
  taHandicapSeconds?: number;
}

interface SelectedPlayer {
  playerId: string;
  taHandicapSeconds: TaHandicapSeconds;
}

export default function BattleRoyaleSetupClient({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const { data: session } = useSession();
  const t = useTranslations("ta");
  const tc = useTranslations("common");
  const isAdmin = session?.user?.role === "admin";

  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<SelectedPlayer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchAllPlayersForSetup<Player>()
      .then((result) => {
        if (!cancelled) setPlayers(result ?? []);
      })
      .catch((fetchError) => {
        logger.error("Failed to fetch players for battle royale setup", {
          error: fetchError,
          tournamentId,
        });
        if (!cancelled) setError(tc("networkError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tc, tournamentId]);

  const selectedByPlayerId = useMemo(
    () => new Map(selectedPlayers.map((entry) => [entry.playerId, entry])),
    [selectedPlayers],
  );

  const filteredPlayers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return players;
    return players.filter(
      (player) =>
        player.nickname.toLowerCase().includes(query) ||
        player.name.toLowerCase().includes(query),
    );
  }, [players, searchQuery]);

  const allFilteredSelected =
    filteredPlayers.length > 0 &&
    filteredPlayers.every((player) => selectedByPlayerId.has(player.id));

  const togglePlayer = (player: Player, checked: boolean) => {
    setSelectedPlayers((current) => {
      if (!checked)
        return current.filter((entry) => entry.playerId !== player.id);
      if (current.some((entry) => entry.playerId === player.id)) return current;
      return [
        ...current,
        {
          playerId: player.id,
          taHandicapSeconds: normalizeTaHandicapSeconds(
            player.taHandicapSeconds,
          ),
        },
      ];
    });
  };

  const toggleAllFiltered = (checked: boolean) => {
    const visibleIds = new Set(filteredPlayers.map((player) => player.id));
    setSelectedPlayers((current) => {
      if (!checked)
        return current.filter((entry) => !visibleIds.has(entry.playerId));
      const selectedIds = new Set(current.map((entry) => entry.playerId));
      return [
        ...current,
        ...filteredPlayers
          .filter((player) => !selectedIds.has(player.id))
          .map((player) => ({
            playerId: player.id,
            taHandicapSeconds: normalizeTaHandicapSeconds(
              player.taHandicapSeconds,
            ),
          })),
      ];
    });
  };

  const updateHandicap = (
    playerId: string,
    taHandicapSeconds: TaHandicapSeconds,
  ) => {
    setSelectedPlayers((current) =>
      current.map((entry) =>
        entry.playerId === playerId ? { ...entry, taHandicapSeconds } : entry,
      ),
    );
  };

  const startBattleRoyale = async () => {
    if (saving || selectedPlayers.length < 2) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/ta/battle-royale`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ players: selectedPlayers }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to start TA battle royale");
      }
      window.location.assign(`/tournaments/${tournamentId}/ta/finals`);
    } catch (startError) {
      const message =
        startError instanceof Error ? startError.message : tc("networkError");
      logger.error("Failed to start TA battle royale", {
        error: startError,
        tournamentId,
      });
      setError(message);
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">
              {t("battleRoyaleFinals")}
            </h1>
            <TaModeBadge mode="battle_royale" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t("battleRoyalePhaseSummary")}
          </p>
        </div>
        {isAdmin && (
          <ModePublishSwitch
            tournamentId={tournamentId}
            mode="ta"
            modeLabelKey="timeTrial"
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("setupPlayers")}</CardTitle>
          <CardDescription>{t("battleRoyaleStartRuleLock")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isAdmin ? (
            <p className="py-6 text-center text-muted-foreground">
              {tc("notStarted")}
            </p>
          ) : loading ? (
            <div className="h-40 animate-pulse rounded-md bg-muted" />
          ) : (
            <>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("searchPlayers")}
              />

              <div className="flex items-center gap-3 border-b pb-3">
                <Checkbox
                  id="battle-royale-select-all"
                  checked={allFilteredSelected}
                  onCheckedChange={(checked) =>
                    toggleAllFiltered(checked === true)
                  }
                />
                <Label
                  htmlFor="battle-royale-select-all"
                  className="cursor-pointer"
                >
                  {t("selectAll")}
                </Label>
                <span className="ml-auto text-sm text-muted-foreground">
                  {selectedPlayers.length}
                </span>
              </div>

              <div className="max-h-[55vh] divide-y overflow-y-auto rounded-md border">
                {filteredPlayers.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    {tc("noPlayersSelected")}
                  </p>
                ) : (
                  filteredPlayers.map((player) => {
                    const selected = selectedByPlayerId.get(player.id);
                    return (
                      <div
                        key={player.id}
                        className="flex min-h-14 items-center gap-3 px-3 py-2"
                      >
                        <Checkbox
                          id={`battle-royale-player-${player.id}`}
                          checked={Boolean(selected)}
                          onCheckedChange={(checked) =>
                            togglePlayer(player, checked === true)
                          }
                        />
                        <Label
                          htmlFor={`battle-royale-player-${player.id}`}
                          className="min-w-0 flex-1 cursor-pointer"
                        >
                          <span className="block truncate font-medium">
                            {player.nickname}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {player.name}
                          </span>
                        </Label>
                        {selected && (
                          <TaHandicapSelect
                            value={selected.taHandicapSeconds}
                            onValueChange={(value) =>
                              updateHandicap(player.id, value)
                            }
                            aria-label={`${player.nickname} ${t("handicap")}`}
                            className="w-24"
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                <ul className="list-disc space-y-1 pl-5">
                  <li>{t("battleRoyaleStartRuleLives")}</li>
                  <li>{t("battleRoyaleStartRuleHandicap")}</li>
                  <li>{t("battleRoyaleStartRuleLock")}</li>
                </ul>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={selectedPlayers.length < 2 || saving}
                >
                  {t("startPhase3")} ({selectedPlayers.length})
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("startBattleRoyaleConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("startBattleRoyaleConfirmDesc", {
                count: selectedPlayers.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>
              {tc("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void startBattleRoyale();
              }}
            >
              {saving ? t("savingPlayers") : t("startBattleRoyaleFinals")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
