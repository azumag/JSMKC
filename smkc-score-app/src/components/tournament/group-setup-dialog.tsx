/**
 * GroupSetupDialog - Shared component for BM/MR/GP group setup
 *
 * Provides a wide two-column dialog for assigning players to qualification groups.
 * Left column: searchable player checklist with select-all
 * Right column: selected players with seeding number, group assignment, and action buttons
 *
 * Used by Battle Mode, Match Race, and Grand Prix qualification pages
 * to eliminate code duplication across all three game modes.
 *
 * Features:
 * - Two-column responsive layout (stacks on mobile)
 * - Player search filtering by name/nickname
 * - Select All / deselect for filtered results
 * - Seeding number input per player (for §10 qualification flow)
 * - Qualification group count is selectable (2 or 3; see docs/finals-entrant-selection.{ja,en}.md
 *   for how finals entrant selection differs between the two)
 * - Group A-D assignment per player
 * - Auto-distribute by seeding (snake pattern per §10.2)
 * - Random group assignment button (development mode only)
 * - Sticky footer with save button always visible
 * - Handles open/close logic: pre-populates existing assignments on open, resets on close
 */
"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/ui/country-flag";
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
import {
  GROUPS,
  assignGroupsBySeeding,
  randomlyAssignGroups,
  type SetupPlayer,
} from "@/lib/group-utils";

/**
 * Selectable group counts (docs/qualification-combined-ranking.md §7: 4+
 * groups are out of scope for now). This is internal component state, not a
 * prop -- see issue #1007/#1678, which removed a `groupCount`/`setGroupCount`
 * prop pair that the dialog never actually needed the parent for.
 */
const GROUP_COUNT_OPTIONS = [2, 3] as const;
const DEFAULT_GROUP_COUNT: number = GROUP_COUNT_OPTIONS[0];
const MIN_GROUPS: number = GROUP_COUNT_OPTIONS[0];

/**
 * Reassigns any player whose current group isn't in `availableGroups` to the
 * last available group (e.g. group C players when switching 3 groups -> 2).
 * Shared by handleOpenChange's edit-mode load and handleGroupCountChange's
 * live toggle, which both need this same remap.
 */
function remapToAvailableGroups<T extends { group: string }>(
  players: T[],
  availableGroups: readonly string[],
): T[] {
  return players.map((p) =>
    availableGroups.includes(p.group) ? p : { ...p, group: availableGroups[availableGroups.length - 1] },
  );
}

/** Player data structure matching the API response */
export interface Player {
  id: string;
  name: string;
  nickname: string;
  /** Stored country value (ISO code or legacy name); rendered as an inline flag. */
  country?: string | null;
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
  /** Whether a save operation is in progress (disables button, shows spinner) */
  saving?: boolean;
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
  saving = false,
  existingAssignments,
}: GroupSetupDialogProps) {
  /* Resolve translations internally using mode prop - avoids props drilling */
  const t = useTranslations(mode);
  const tc = useTranslations("common");
  const locale = useLocale();

  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [groupCount, setGroupCount] = useState<number>(DEFAULT_GROUP_COUNT);

  const hasExistingQualifications = existingAssignments.length > 0;

  const availableGroups = GROUPS.slice(0, groupCount);

  const minGroups = MIN_GROUPS;

  /**
   * Handle dialog open/close with automatic state management.
   * On open: pre-populates with existing assignments if in edit mode.
   * On close: resets the setup state and search query.
   */
  const handleOpenChange = (open: boolean) => {
    if (open && hasExistingQualifications) {
      /* Edit mode: infer the group count already in use from the existing
       * assignments (rather than resetting to the default), so editing a
       * 3-group tournament re-opens showing 3 groups selected. */
      const distinctGroupCount = new Set(existingAssignments.map((a) => a.group)).size;
      const inferredGroupCount =
        GROUP_COUNT_OPTIONS.find((n) => n >= distinctGroupCount) ??
        GROUP_COUNT_OPTIONS[GROUP_COUNT_OPTIONS.length - 1];
      const inferredGroups = GROUPS.slice(0, inferredGroupCount) as readonly string[];
      setGroupCount(inferredGroupCount);
      setSetupPlayers(remapToAvailableGroups(existingAssignments, inferredGroups));
    } else if (!open) {
      /* Close: reset all form state */
      setSetupPlayers([]);
      setPlayerSearchQuery("");
      setGroupCount(DEFAULT_GROUP_COUNT);
    }
    setIsOpen(open);
  };

  /**
   * Handle the admin changing the group count via the selector buttons.
   * Any player whose current group no longer exists under the new count
   * (e.g. group C players when switching 3 -> 2) is reassigned to the last
   * remaining group, mirroring the edit-mode remap in handleOpenChange.
   */
  const handleGroupCountChange = (nextCount: number) => {
    if (nextCount === groupCount) return;
    const nextGroups = GROUPS.slice(0, nextCount) as readonly string[];
    setGroupCount(nextCount);
    setSetupPlayers(remapToAvailableGroups(setupPlayers, nextGroups));
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
    setSetupPlayers(randomlyAssignGroups(setupPlayers, groupCount, minGroups));
  };

  /**
   * Handle seeding-based auto distribution (snake pattern per §10.2).
   * Button is disabled when not all players have seeding, so this is a safety guard.
   */
  const handleAutoDistribute = () => {
    if (setupPlayers.length === 0 || !allHaveSeeding) return;
    setSetupPlayers(assignGroupsBySeeding(setupPlayers, groupCount, minGroups));
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

  /* Check if all players have valid positive integer seeding */
  const allHaveSeeding =
    setupPlayers.length > 0 &&
    setupPlayers.every(
      (p) => typeof p.seeding === "number" && Number.isInteger(p.seeding) && p.seeding >= 1,
    );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant={hasExistingQualifications ? "outline" : "default"}
          data-variant={hasExistingQualifications ? "outline" : "default"}
        >
          {hasExistingQualifications ? tc("editGroups") : tc("setupGroups")}
        </Button>
      </DialogTrigger>
      {/*
       * Wide dialog with responsive width and max-h constraint.
       * Mobile-first approach with progressive enhancement per breakpoint.
       */}
      <DialogContent className="w-[calc(100vw-2rem)] sm:w-[calc(100vw-4rem)] md:w-[max-content] lg:max-w-5xl max-h-[90vh] flex flex-col p-4 sm:p-5 md:p-6">
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
         * - Right: selected players with seeding + group assignments
         */}
        {/* On mobile: whole area scrolls; on desktop: each column scrolls independently */}
        <div className="flex-1 overflow-y-auto md:overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:h-full">
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
                          .map((p) => ({ playerId: p.id, group: availableGroups[0] }));
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
                    className="h-11 w-11 sm:h-10 sm:w-10 md:h-5 md:w-5"
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
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
                {filteredPlayers.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-2">
                    {tc("noPlayersSelected")}
                  </p>
                ) : (
                  filteredPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center gap-2 py-2 sm:py-1 px-2 sm:px-1 rounded hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`player-${player.id}`}
                        checked={selectedIds.has(player.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            addPlayerToSetup(player.id, availableGroups[0]);
                          } else {
                            removePlayerFromSetup(player.id);
                          }
                        }}
                        className="h-11 w-11 sm:h-10 sm:w-10 md:h-5 md:w-5"
                      />
                      <Label
                        htmlFor={`player-${player.id}`}
                        className="cursor-pointer flex-1"
                      >
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <CountryFlag country={player.country} locale={locale} />
                          <span className="truncate">{player.nickname} ({player.name})</span>
                        </span>
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right column: Selected players with seeding + group assignments */}
            <div className="flex flex-col min-h-0">
              {/* Header row: title + group count + action buttons */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h4 className="font-medium">
                  {tc("selectedPlayers", { count: setupPlayers.length })}
                </h4>
                <div className="flex-1" />
                {/* Group count selector: 2 or 3 groups (4+ groups out of scope, docs/qualification-combined-ranking.md §7) */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">{tc("groupCount")}:</span>
                  {GROUP_COUNT_OPTIONS.map((n) => (
                    <Button
                      key={n}
                      variant={n === groupCount ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0 text-xs"
                      onClick={() => handleGroupCountChange(n)}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
              </div>
              {/* Action buttons row */}
              {setupPlayers.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {/* Auto-distribute by seeding button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAutoDistribute}
                    disabled={!allHaveSeeding}
                    title={allHaveSeeding ? tc("autoDistributeDesc") : tc("enterSeedingFirst")}
                  >
                    {tc("autoDistribute")}
                  </Button>
                  {/* Random assignment button - shuffle players across groups */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRandomAssign}
                    title={tc("randomAssignDesc")}
                  >
                    {tc("randomAssign")}
                  </Button>
                </div>
              )}
              {/* Scrollable selected players list */}
              <div className="flex-1 min-h-0 overflow-y-auto border rounded-lg">
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
                          {/* Seeding number input: compact width for 1-2 digit numbers */}
                          <Input
                            type="number"
                            min={1}
                            placeholder="#"
                            value={sp.seeding ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              const parsed = parseInt(val, 10);
                              /* Guard: only accept valid positive integers */
                              const seeding = val && !Number.isNaN(parsed) && parsed >= 1
                                ? parsed
                                : undefined;
                              setSetupPlayers(
                                setupPlayers.map((p) =>
                                  p.playerId === sp.playerId
                                    ? { ...p, seeding }
                                    : p
                                )
                              );
                            }}
                            className="w-14 h-11 sm:h-10 md:h-9 text-center text-sm"
                          />
                          {/* Player name with fallback for missing data */}
                          <span className="flex-1 text-sm min-w-0 inline-flex items-center gap-1.5">
                            <CountryFlag country={player?.country} locale={locale} />
                            <span className="truncate">
                              {player?.nickname ?? `ID: ${sp.playerId.slice(0, 8)}`}
                            </span>
                          </span>
                          {/* Group selector: only shows groups available for current groupCount */}
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
                            <SelectTrigger className="w-20 h-11 sm:h-10 md:h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {availableGroups.map((g) => (
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
                            className="min-h-[44px] md:min-h-[32px]"
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
          <Button onClick={onSave} disabled={saving}>
            {saving
              ? (tc("saving") ?? "Saving...")
              : hasExistingQualifications
                ? tc("updateGroups")
                : t("createGroupsAndMatches")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
