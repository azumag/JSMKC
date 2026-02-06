/**
 * GroupSetupDialog - Shared component for BM/MR/GP group setup
 *
 * Provides a wide two-column dialog for assigning players to qualification groups.
 * Left column: searchable player checklist with select-all
 * Right column: selected players with group assignment dropdowns + save/random buttons
 *
 * Used by Battle Mode, Match Race, and Grand Prix qualification pages
 * to eliminate code duplication across all three game modes.
 *
 * Features:
 * - Two-column responsive layout (stacks on mobile)
 * - Player search filtering by name/nickname
 * - Select All / deselect for filtered results
 * - Group A/B/C assignment per player
 * - Random group assignment button (development mode only)
 * - Sticky footer with save button always visible
 * - Handles open/close logic: pre-populates existing assignments on open, resets on close
 */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { GROUPS, randomlyAssignGroups, type SetupPlayer } from "@/lib/group-utils";

/** Player data structure matching the API response */
export interface Player {
  id: string;
  name: string;
  nickname: string;
}

/* Re-export for consumers that import from here */
export type { SetupPlayer } from "@/lib/group-utils";

interface GroupSetupDialogProps {
  /** Game mode - used to resolve mode-specific translations internally */
  mode: "bm" | "mr" | "gp";
  /** All available players from the API */
  allPlayers: Player[];
  /** Current player-group assignments (state managed by parent) */
  setupPlayers: SetupPlayer[];
  /** Callback to update player-group assignments */
  setSetupPlayers: (players: SetupPlayer[]) => void;
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback to set dialog open/close state */
  setIsOpen: (open: boolean) => void;
  /** Save handler - called when user clicks save */
  onSave: () => void;
  /**
   * Existing player-group assignments from qualification data.
   * When the dialog opens in edit mode, these are loaded into the form.
   * Pass an empty array when no qualifications exist yet.
   */
  existingAssignments: SetupPlayer[];
}

export function GroupSetupDialog({
  mode,
  allPlayers,
  setupPlayers,
  setSetupPlayers,
  isOpen,
  setIsOpen,
  onSave,
  existingAssignments,
}: GroupSetupDialogProps) {
  /* Resolve translations internally using mode prop - avoids props drilling */
  const t = useTranslations(mode);
  const tc = useTranslations("common");

  const [playerSearchQuery, setPlayerSearchQuery] = useState("");

  /*
   * Use process.env.NODE_ENV for dev mode detection.
   * More reliable than hostname check - standard Next.js approach,
   * stripped at build time in production builds.
   */
  const isDev = process.env.NODE_ENV === "development";

  const hasExistingQualifications = existingAssignments.length > 0;

  /**
   * Handle dialog open/close with automatic state management.
   * On open: pre-populates with existing assignments if in edit mode.
   * On close: resets the setup state and search query.
   * This logic was previously duplicated in all 3 page components.
   */
  const handleOpenChange = (open: boolean) => {
    if (open && hasExistingQualifications) {
      /* Edit mode: load existing player-group assignments into the form */
      setSetupPlayers([...existingAssignments]);
    } else if (!open) {
      /* Close: reset all form state */
      setSetupPlayers([]);
      setPlayerSearchQuery("");
    }
    setIsOpen(open);
  };

  /** Add a player to the setup list with a default group */
  const addPlayerToSetup = (playerId: string, group: string) => {
    if (!setupPlayers.find((p) => p.playerId === playerId)) {
      setSetupPlayers([...setupPlayers, { playerId, group }]);
    }
  };

  /** Remove a player from the setup list */
  const removePlayerFromSetup = (playerId: string) => {
    setSetupPlayers(setupPlayers.filter((p) => p.playerId !== playerId));
  };

  /** Handle random group assignment for all selected players */
  const handleRandomAssign = () => {
    if (setupPlayers.length === 0) return;
    setSetupPlayers(randomlyAssignGroups(setupPlayers));
  };

  /* Filter players by search query (name or nickname) */
  const filteredPlayers = allPlayers.filter((p) => {
    if (!playerSearchQuery) return true;
    const q = playerSearchQuery.toLowerCase();
    return (
      p.nickname.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    );
  });

  const selectedIds = new Set(setupPlayers.map((sp) => sp.playerId));
  const allFilteredSelected =
    filteredPlayers.length > 0 &&
    filteredPlayers.every((p) => selectedIds.has(p.id));

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant={hasExistingQualifications ? "outline" : "default"}
        >
          {hasExistingQualifications ? tc("editGroups") : tc("setupGroups")}
        </Button>
      </DialogTrigger>
      {/*
       * Wide dialog with max-h constraint. Uses flex column layout
       * so the footer (save button) stays visible at the bottom.
       */}
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {hasExistingQualifications
              ? t("editGroupsTitle")
              : t("setupDialogTitle")}
          </DialogTitle>
          <DialogDescription>
            {hasExistingQualifications
              ? t("editGroupsDesc")
              : t("setupDialogDesc")}
          </DialogDescription>
        </DialogHeader>

        {/*
         * Two-column layout:
         * - Left: player checkbox list with search
         * - Right: selected players with group assignments
         * Stacks vertically on small screens for mobile support.
         */}
        <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
            {/* Left column: Player selection with search */}
            <div className="flex flex-col min-h-0">
              <h4 className="font-medium mb-2">{tc("player")}</h4>
              <Input
                placeholder={t("searchPlayers")}
                value={playerSearchQuery}
                onChange={(e) => setPlayerSearchQuery(e.target.value)}
                className="mb-2"
              />
              {/* Select All checkbox */}
              {filteredPlayers.length > 0 && (
                <div className="flex items-center gap-2 py-1 border-b mb-1">
                  <Checkbox
                    id="select-all"
                    checked={allFilteredSelected}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        const newPlayers = filteredPlayers
                          .filter((p) => !selectedIds.has(p.id))
                          .map((p) => ({ playerId: p.id, group: GROUPS[0] }));
                        setSetupPlayers([...setupPlayers, ...newPlayers]);
                      } else {
                        const filteredIds = new Set(
                          filteredPlayers.map((p) => p.id)
                        );
                        setSetupPlayers(
                          setupPlayers.filter(
                            (sp) => !filteredIds.has(sp.playerId)
                          )
                        );
                      }
                    }}
                  />
                  <Label
                    htmlFor="select-all"
                    className="cursor-pointer font-medium"
                  >
                    {t("selectAll")}
                  </Label>
                </div>
              )}
              {/* Scrollable player list */}
              <div className="flex-1 overflow-y-auto max-h-[45vh] space-y-1">
                {filteredPlayers.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-2">
                    {tc("noPlayersSelected")}
                  </p>
                ) : (
                  filteredPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`player-${player.id}`}
                        checked={selectedIds.has(player.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            addPlayerToSetup(player.id, GROUPS[0]);
                          } else {
                            removePlayerFromSetup(player.id);
                          }
                        }}
                      />
                      <Label
                        htmlFor={`player-${player.id}`}
                        className="cursor-pointer flex-1"
                      >
                        {player.nickname} ({player.name})
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right column: Selected players with group assignments */}
            <div className="flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">
                  {tc("selectedPlayers", { count: setupPlayers.length })}
                </h4>
                {/* Random assignment button - development mode only */}
                {isDev && setupPlayers.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRandomAssign}
                    title={tc("randomAssignDesc")}
                  >
                    {tc("randomAssign")}
                  </Button>
                )}
              </div>
              {/* Scrollable selected players list */}
              <div className="flex-1 overflow-y-auto max-h-[45vh] border rounded-lg">
                {setupPlayers.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-4 text-center">
                    {tc("noPlayersSelected")}
                  </p>
                ) : (
                  <div className="divide-y">
                    {setupPlayers.map((sp) => {
                      const player = allPlayers.find(
                        (p) => p.id === sp.playerId
                      );
                      return (
                        <div
                          key={sp.playerId}
                          className="flex items-center gap-2 px-3 py-2"
                        >
                          {/* Player name with fallback for missing data */}
                          <span className="flex-1 text-sm truncate">
                            {player?.nickname ?? `ID: ${sp.playerId.slice(0, 8)}`}
                          </span>
                          {/* Group selector */}
                          <Select
                            value={sp.group}
                            onValueChange={(group) => {
                              setSetupPlayers(
                                setupPlayers.map((p) =>
                                  p.playerId === sp.playerId
                                    ? { ...p, group }
                                    : p
                                )
                              );
                            }}
                          >
                            <SelectTrigger className="w-20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {GROUPS.map((g) => (
                                <SelectItem key={g} value={g}>{g}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {/* Remove button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              removePlayerFromSetup(sp.playerId)
                            }
                          >
                            {tc("remove")}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sticky footer - always visible at dialog bottom */}
        <DialogFooter className="pt-4 border-t">
          <Button onClick={onSave}>
            {hasExistingQualifications
              ? tc("updateGroups")
              : t("createGroupsAndMatches")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
