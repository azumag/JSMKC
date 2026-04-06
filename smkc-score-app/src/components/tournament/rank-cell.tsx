/**
 * RankCell Component
 *
 * Displays a qualification rank number in a standings table cell.
 * When an admin has overridden the rank, shows an amber badge with the override value.
 * Admins see an inline edit control (pencil icon → number input) to set or clear overrides.
 *
 * Design:
 * - Non-admin: plain number (auto rank) or amber badge (override)
 * - Admin: same display + pencil edit button → inline number input
 * - Clearing: explicit ✕ button clears the override and restores automatic ranking
 *
 * Used by BM, MR, and GP qualification pages to avoid duplicating ~50 lines of JSX.
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RankCellProps {
  /** Qualification record ID (used in the PATCH request body) */
  qualificationId: string;
  /** Admin-set rank override value, or null for automatic ranking */
  rankOverride: number | null;
  /** Fallback rank to display when no override is set (auto-computed) */
  autoRank: number;
  /** Whether the current user is an admin (controls edit controls visibility) */
  isAdmin: boolean;
  /** Called when the admin saves a new rank or clears the override */
  onSave: (qualificationId: string, rankOverride: number | null) => Promise<void>;
}

/**
 * Standalone rank cell that manages its own edit state.
 * The edit state (input value + open/closed) is local because only one row is
 * ever in edit mode at a time and there is no need to lift this state.
 */
export function RankCell({ qualificationId, rankOverride, autoRank, isAdmin, onSave }: RankCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const openEdit = () => {
    setInputValue(rankOverride?.toString() ?? "");
    setIsEditing(true);
  };

  const commitSave = async () => {
    const v = parseInt(inputValue);
    await onSave(qualificationId, isNaN(v) ? null : v);
    setIsEditing(false);
  };

  const commitClear = async () => {
    await onSave(qualificationId, null);
    setIsEditing(false);
  };

  if (isAdmin && isEditing) {
    return (
      /* Inline rank editor: number input + save/cancel/clear controls */
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={1}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="w-14 h-7 text-center text-sm p-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") commitSave();
            if (e.key === "Escape") setIsEditing(false);
          }}
          autoFocus
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-1 text-xs"
          onClick={commitSave}
        >
          ✓
        </Button>
        {rankOverride != null && (
          /* Clear button: removes override and restores automatic rank */
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1 text-xs text-destructive"
            onClick={commitClear}
          >
            ✕
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {rankOverride != null ? (
        /* Amber badge signals that this rank was manually set by an admin */
        <span className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
          {rankOverride}
        </span>
      ) : (
        <span>{autoRank}</span>
      )}
      {isAdmin && (
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 p-0 opacity-40 hover:opacity-100"
          onClick={openEdit}
          aria-label="Edit rank"
        >
          ✎
        </Button>
      )}
    </div>
  );
}
