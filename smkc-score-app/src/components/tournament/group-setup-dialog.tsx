/**
 * GroupSetupDialog - Shared player-setup dialog for BM/MR/GP/TA qualifications
 *
 * Provides a wide two-column dialog for selecting qualification participants and
 * configuring their per-mode attributes.
 *
 * Left column: searchable player checklist with select-all
 * Right column: selected players with per-mode controls:
 *   - BM/MR/GP: seeding number, group (A-D) dropdown
 *   - TA:       seeding number, partner dropdown (pair running per §3.1)
 *
 * Features shared across all modes:
 * - Two-column responsive layout (stacks on mobile)
 * - Player search filtering by name/nickname
 * - Select All / deselect for filtered results
 * - Seeding number input per player (for §10 qualification flow)
 * - Sticky footer with save button always visible
 * - Handles open/close logic: pre-populates existing assignments on open, resets on close
 *
 * Mode-specific controls:
 * - BM/MR/GP: group count selector (1-4), group assignment dropdown, auto-distribute & random-assign
 * - TA: auto-pair (snake pairing by seeding) — no group concept, no match generation on save
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
import {
  GROUPS,
  MIN_PLAYERS_FOR_RECOMMENDATION,
  assignGroupsBySeeding,
  randomlyAssignGroups,
  recommendGroupCount,
  type SetupPlayer,
} from "@/lib/group-utils";
import { computeAutoPairs } from "@/lib/ta/pair-utils";

/**
 * Fixed placeholder group for TA setup rows.
 *
 * TA does not use qualification groups, but `SetupPlayer` requires a
 * non-empty `group` value. The dialog hides this field entirely in TA mode.
 * Exported so parent pages (ta/page.tsx) can use the same constant when
 * building `existingAssignments` — keeps the placeholder in a single place.
 */
export const TA_PLACEHOLDER_GROUP = "A";

/** Player data structure matching the API response */
export interface Player {
  id: string;
  name: string;
  nickname: string;
}

/* Re-export for consumers that import from here */
export type { SetupPlayer } from "@/lib/group-utils";

interface GroupSetupDialogProps {
  /** Game mode - used to resolve mode-specific translations internally.
   *  BM/MR/GP show group assignment UI; TA shows partner (pair) assignment UI. */
  mode: "bm" | "mr" | "gp" | "ta";
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
  /** Number of groups (2, 3, or 4). Managed by parent component.
   *  Ignored in TA mode (TA doesn't use groups). Pass 1 for TA. */
  groupCount: number;
  /** Callback to update group count. Ignored in TA mode. */
  setGroupCount: (count: number) => void;
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
  groupCount,
  setGroupCount,
}: GroupSetupDialogProps) {
  /* Resolve translations internally using mode prop - avoids props drilling */
  const t = useTranslations(mode);
  const tc = useTranslations("common");

  const [playerSearchQuery, setPlayerSearchQuery] = useState("");

  const hasExistingQualifications = existingAssignments.length > 0;
  const isTAMode = mode === "ta";

  /* Available groups based on current group count selection (BM/MR/GP only) */
  const availableGroups = GROUPS.slice(0, groupCount);

  /* Default "group" value for a new setup entry.
   * In BM/MR/GP it is the first available group; in TA it is a hidden placeholder. */
  const defaultGroup = isTAMode ? TA_PLACEHOLDER_GROUP : availableGroups[0];

  /* All 2P modes (BM/MR/GP) allow 1 group; TA always uses a single fixed placeholder */
  const minGroups = 1;

  /**
   * Handle dialog open/close with automatic state management.
   * On open: pre-populates with existing assignments if in edit mode.
   * On close: resets the setup state and search query.
   */
  const handleOpenChange = (open: boolean) => {
    if (open && hasExistingQualifications) {
      /* Edit mode: load existing player-group assignments into the form */
      setSetupPlayers([...existingAssignments]);
      if (!isTAMode) {
        /*
         * Infer group count from existing data by finding the highest group letter.
         * Uses GROUPS.indexOf to handle non-contiguous assignments (e.g., A,C without B).
         */
        const maxIdx = Math.max(
          ...existingAssignments.map((a) => (GROUPS as readonly string[]).indexOf(a.group)),
        );
        setGroupCount(Math.max(maxIdx + 1, minGroups));
      }
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

  /** Remove a player from the setup list.
   *  In TA mode, also clears the departing player's partner link on the remaining entries. */
  const removePlayerFromSetup = (playerId: string) => {
    if (isTAMode) {
      setSetupPlayers(
        setupPlayers
          .filter((p) => p.playerId !== playerId)
          .map((p) => (p.partnerId === playerId ? { ...p, partnerId: null } : p)),
      );
      return;
    }
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

  /**
   * Handle auto-pair assignment for TA mode (§3.1).
   * Uses snake pairing: seed1↔seedN, seed2↔seed(N-1), ...
   * Requires all selected players to have a seeding value.
   */
  const handleAutoPair = () => {
    if (!isTAMode || setupPlayers.length < 2 || !allHaveSeeding) return;
    const pairInput = setupPlayers.map((p) => ({
      id: p.playerId,
      playerId: p.playerId,
      seeding: p.seeding ?? null,
    }));
    const pairs = computeAutoPairs(pairInput);
    const partnerMap = new Map<string, string | null>();
    /* Clear all partners first; snake pairing with odd count leaves last player unpaired. */
    setupPlayers.forEach((p) => partnerMap.set(p.playerId, null));
    pairs.forEach(([a, b]) => {
      partnerMap.set(a.playerId, b.playerId);
      partnerMap.set(b.playerId, a.playerId);
    });
    setSetupPlayers(
      setupPlayers.map((p) => ({ ...p, partnerId: partnerMap.get(p.playerId) ?? null })),
    );
  };

  /**
   * Update a player's partner selection in TA mode.
   * Maintains bidirectional consistency: setting A→B also sets B→A,
   * and clears any prior partner links for both sides so we never leave orphans.
   */
  const handlePartnerChange = (playerId: string, newPartnerId: string | null) => {
    const current = setupPlayers.find((p) => p.playerId === playerId);
    if (!current) return;
    const oldPartnerId = current.partnerId ?? null;
    /* If the new partner already paired with someone else, that partner will be orphaned.
     * We explicitly clear that link so the UI state stays consistent with what will be
     * persisted to the server. */
    const newPartnerOldPartner = newPartnerId
      ? setupPlayers.find((p) => p.playerId === newPartnerId)?.partnerId ?? null
      : null;

    setSetupPlayers(
      setupPlayers.map((p) => {
        if (p.playerId === playerId) return { ...p, partnerId: newPartnerId };
        if (newPartnerId && p.playerId === newPartnerId) {
          return { ...p, partnerId: playerId };
        }
        /* Clear prior partner's reverse link */
        if (oldPartnerId && p.playerId === oldPartnerId && oldPartnerId !== newPartnerId) {
          return { ...p, partnerId: null };
        }
        /* Clear new partner's OLD partner, if any (and it's not us) */
        if (
          newPartnerOldPartner &&
          p.playerId === newPartnerOldPartner &&
          newPartnerOldPartner !== playerId
        ) {
          return { ...p, partnerId: null };
        }
        return p;
      }),
    );
  };

  /**
   * When group count decreases, remap players whose group
   * is no longer available to the last available group.
   */
  const handleGroupCountChange = (newCount: number) => {
    setGroupCount(newCount);
    const newGroups = GROUPS.slice(0, newCount);
    const lastGroup = newGroups[newGroups.length - 1];
    setSetupPlayers(
      setupPlayers.map((p) =>
        (newGroups as readonly string[]).includes(p.group)
          ? p
          : { ...p, group: lastGroup },
      ),
    );
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
        >
          {isTAMode
            ? hasExistingQualifications
              ? t("editDialogTrigger")
              : t("setupDialogTrigger")
            : hasExistingQualifications
              ? tc("editGroups")
              : tc("setupGroups")}
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
        <div className="flex-1 overflow-y-auto md:overflow-hidden">
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
                          .map((p) => ({ playerId: p.id, group: defaultGroup }));
                        setSetupPlayers([...setupPlayers, ...newPlayers]);
                      } else {
                        const filteredIds = new Set(
                          filteredPlayers.map((p) => p.id)
                        );
                        const remaining = setupPlayers.filter(
                          (sp) => !filteredIds.has(sp.playerId),
                        );
                        /* In TA mode, break any partner links that point into the
                         * just-removed set so the remaining state stays consistent. */
                        setSetupPlayers(
                          isTAMode
                            ? remaining.map((p) =>
                                p.partnerId && filteredIds.has(p.partnerId)
                                  ? { ...p, partnerId: null }
                                  : p,
                              )
                            : remaining,
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
                            addPlayerToSetup(player.id, defaultGroup);
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
                        {player.nickname} ({player.name})
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right column: Selected players with seeding + group/partner assignments */}
            <div className="flex flex-col min-h-0">
              {/* Header row: title + (BM/MR/GP only) group count selector */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h4 className="font-medium">
                  {tc("selectedPlayers", { count: setupPlayers.length })}
                </h4>
                <div className="flex-1" />
                {/* Group count selector (BM/MR/GP only; TA doesn't use groups) */}
                {!isTAMode && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{tc("groupCount")}:</span>
                    {[...new Set([minGroups, 2, 3, 4])].map((n) => (
                      <Button
                        key={n}
                        variant={groupCount === n ? "default" : "outline"}
                        size="sm"
                        className="h-7 w-7 p-0 text-xs"
                        onClick={() => handleGroupCountChange(n)}
                      >
                        {n}
                      </Button>
                    ))}
                    {/* Show recommendation when enough players are selected */}
                    {setupPlayers.length >= MIN_PLAYERS_FOR_RECOMMENDATION && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({tc("recommendedGroups", { count: recommendGroupCount(setupPlayers.length) })})
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* Action buttons row */}
              {setupPlayers.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {isTAMode ? (
                    /* TA: snake pairing by seeding (§3.1) */
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAutoPair}
                      disabled={!allHaveSeeding || setupPlayers.length < 2}
                      title={allHaveSeeding ? undefined : tc("enterSeedingFirst")}
                    >
                      {t("autoPair")}
                    </Button>
                  ) : (
                    <>
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
                    </>
                  )}
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
                          <span className="flex-1 text-sm truncate">
                            {player?.nickname ?? `ID: ${sp.playerId.slice(0, 8)}`}
                          </span>
                          {isTAMode ? (
                            /* Partner selector (§3.1). The native <select> is used
                             * instead of the shadcn Select because the long option
                             * lists scroll better in a dense dialog and mirror the
                             * original pair-management table. */
                            <select
                              aria-label={t("partner")}
                              className="border rounded px-2 h-11 sm:h-10 md:h-9 text-sm bg-background max-w-[12rem]"
                              value={sp.partnerId ?? ""}
                              onChange={(ev) =>
                                handlePartnerChange(sp.playerId, ev.target.value || null)
                              }
                            >
                              <option value="">{t("noPair")}</option>
                              {setupPlayers
                                .filter((other) => other.playerId !== sp.playerId)
                                .map((other) => {
                                  const otherPlayer = allPlayers.find(
                                    (ap) => ap.id === other.playerId,
                                  );
                                  return (
                                    <option key={other.playerId} value={other.playerId}>
                                      {otherPlayer?.nickname ?? other.playerId.slice(0, 8)}
                                      {other.seeding != null ? ` (#${other.seeding})` : ""}
                                    </option>
                                  );
                                })}
                            </select>
                          ) : (
                            /* Group selector: only shows groups available for current groupCount */
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
                          )}
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
              : isTAMode
                ? tc("save")
                : hasExistingQualifications
                  ? tc("updateGroups")
                  : t("createGroupsAndMatches")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
