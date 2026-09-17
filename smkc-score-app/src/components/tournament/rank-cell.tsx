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

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createLogger } from '@/lib/client-logger';

const logger = createLogger({ serviceName: 'qualification-rank-cell' });

interface RankCellProps {
  /** Qualification record ID (used in the PATCH request body) */
  qualificationId: string;
  /** Admin-set rank override value, or null for automatic ranking */
  rankOverride: number | null;
  /** Fallback rank to display when no override is set (auto-computed) */
  autoRank: number;
  /** Whether the current user is an admin (controls edit controls visibility) */
  isAdmin: boolean;
  /** Called when the admin saves a new rank or clears the override. False keeps the editor open for retry. */
  onSave: (qualificationId: string, rankOverride: number | null) => Promise<boolean | void>;
}

function RankCellSaveError() {
  const tCommon = useTranslations('common');
  return (
    <p className="text-xs text-destructive" role="alert">
      {tCommon('networkError')}
    </p>
  );
}

/**
 * Standalone rank cell that manages its own edit state.
 * The edit state (input value + open/closed) is local because only one row is
 * ever in edit mode at a time and there is no need to lift this state.
 */
export function RankCell({ qualificationId, rankOverride, autoRank, isAdmin, onSave }: RankCellProps) {
  const tRankCell = useTranslations('rankCell');
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  // Unexpected rejected callbacks show a safe localized error; API failures normally return false instead.
  const [saveError, setSaveError] = useState(false);

  const openEdit = () => {
    setInputValue(rankOverride?.toString() ?? '');
    setSaveError(false);
    setIsEditing(true);
  };

  const commitSave = async () => {
    setSaveError(false);
    try {
      const v = parseInt(inputValue);
      // Rank 0 is allowed through (isNaN(0) === false); the API layer enforces
      // minimum rank constraints.
      const saved = await onSave(qualificationId, isNaN(v) ? null : v);
      if (saved !== false) setIsEditing(false);
    } catch (err) {
      // Keep the editor open so the user can retry after seeing a safe error.
      logger.error('Unexpected rank override save rejection:', {
        error: err,
        qualificationId,
        action: 'save',
      });
      setSaveError(true);
    }
  };

  const commitClear = async () => {
    setSaveError(false);
    try {
      const saved = await onSave(qualificationId, null);
      if (saved !== false) setIsEditing(false);
    } catch (err) {
      logger.error('Unexpected rank override save rejection:', {
        error: err,
        qualificationId,
        action: 'clear',
      });
      setSaveError(true);
    }
  };

  if (isAdmin && isEditing) {
    return (
      /* Inline rank editor: number input + save/cancel/clear controls */
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={1}
            value={inputValue}
            aria-label={tRankCell('rankInput')}
            onChange={(e) => setInputValue(e.target.value)}
            className="w-14 h-7 text-center text-sm p-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitSave();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            autoFocus
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1 text-xs"
            onClick={commitSave}
            aria-label={tRankCell('saveRank')}
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
              aria-label={tRankCell('clearRankOverride')}
            >
              ✕
            </Button>
          )}
        </div>
        {saveError && <RankCellSaveError />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {rankOverride != null ? (
        /* Mustard "yellow flag" badge — signals that this rank was manually set by an admin */
        <span className="inline-flex items-center justify-center rounded-sm px-1.5 py-0.5 text-xs font-semibold tabular flag-draft">
          {rankOverride}
        </span>
      ) : (
        <span>{autoRank}</span>
      )}
      {isAdmin && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 opacity-60 hover:opacity-100"
          onClick={openEdit}
          aria-label={tRankCell('editRank')}
        >
          ✎
        </Button>
      )}
    </div>
  );
}
