/**
 * Bracket Slot Edit Dialog
 *
 * Lets an admin manually adjust who occupies a confirmed (non-TBD) bracket
 * slot during CDM — for shuffled-seed corrections or withdrawal/DQ
 * replacements — without losing recorded scores (issue #3017).
 *
 * Three operations, one per tab:
 * - swap: swap the 1P/2P slots of the match itself (one click).
 * - assign: replace the slot's player with another qualification
 *   participant not currently placed in a confirmed slot this stage.
 * - swapSlots: atomically swap this slot with a confirmed slot in a
 *   *different* match in the same round.
 *
 * All three PATCH the existing finals route with `{ matchId, slotEdit }` —
 * see `src/lib/api-factories/finals-route.ts` `handleSlotEdit`.
 */

'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getFinalsSlotStatus, type SlotStatusMatch } from '@/lib/finals-slot-status';
import type { BracketMatch } from '@/types/bracket';
import type { Player } from '@/lib/types';

export interface SlotEditMatchData extends SlotStatusMatch {
  id: string;
  isBye?: boolean;
  version: number;
  player1: Player;
  player2: Player;
}

interface QualificationCandidate {
  playerId: string;
  player: Player;
}

interface SwapSlotsCandidate {
  key: string;
  matchId: string;
  matchNumber: number;
  slot: 1 | 2;
  version: number;
  player: Player;
}

type SlotEditTab = 'swap' | 'assign' | 'swapSlots';

/** A slotEdit op the user has picked but not yet confirmed — holds the
 * human-readable before/after summary shown on the confirmation step
 * (issue #3017 §5: same before→after confirmation tone as the bracket
 * reset AlertDialog). */
interface PendingSlotEdit {
  before: string;
  after: string;
  slotEdit: Record<string, unknown>;
}

const playerLabel = (player?: Player | null): string => player?.nickname || player?.name || '';

export interface BracketSlotEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Finals PATCH endpoint, e.g. `/api/tournaments/{id}/bm/finals`. */
  finalsApiPath: string;
  /** Qualification GET endpoint, e.g. `/api/tournaments/{id}/bm`, used to list assign candidates. */
  qualificationApiPath: string;
  /** The match whose slot was clicked. */
  match: SlotEditMatchData | null;
  /** Which slot (1 or 2) was clicked. */
  slot: 1 | 2 | null;
  /** All matches in the same stage, for candidate filtering. */
  matches: SlotEditMatchData[];
  bracketStructure: BracketMatch[];
  /** Called after a successful save so the caller can refetch bracket data. */
  onSaved: () => void;
}

export function BracketSlotEditDialog({
  open,
  onOpenChange,
  finalsApiPath,
  qualificationApiPath,
  match,
  slot,
  matches,
  bracketStructure,
  onSaved,
}: BracketSlotEditDialogProps) {
  const tf = useTranslations('finals');
  const [tab, setTab] = useState<SlotEditTab>('swap');
  const [saving, setSaving] = useState(false);
  const [qualifications, setQualifications] = useState<QualificationCandidate[]>([]);
  const [loadingQuals, setLoadingQuals] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [selectedTargetKey, setSelectedTargetKey] = useState('');
  const [pending, setPending] = useState<PendingSlotEdit | null>(null);

  const matchId = match?.id ?? null;

  useEffect(() => {
    if (!open) return;
    setTab('swap');
    setSelectedPlayerId('');
    setSelectedTargetKey('');
    setPending(null);
  }, [open, matchId, slot]);

  useEffect(() => {
    if (!open || tab !== 'assign') return;
    let cancelled = false;
    setLoadingQuals(true);
    fetch(qualificationApiPath)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const data = (json && typeof json === 'object' && 'data' in json ? json.data : json) as
          { qualifications?: Array<{ playerId: string; player: Player }> } | undefined;
        setQualifications((data?.qualifications ?? []).map((q) => ({ playerId: q.playerId, player: q.player })));
      })
      .catch(() => {
        /* Candidate list is best-effort; the select just stays empty. */
      })
      .finally(() => {
        if (!cancelled) setLoadingQuals(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, qualificationApiPath]);

  if (!match || slot == null) return null;

  const currentPlayer = slot === 1 ? match.player1 : match.player2;

  /* Confirmed (non-TBD) placements across the stage, for filtering candidates. */
  const placedPlayerIds = new Set<string>();
  for (const m of matches) {
    if (m.completed || m.isBye) continue;
    const status = getFinalsSlotStatus(m.matchNumber, matches, bracketStructure);
    if (!status.player1 && m.player1Id) placedPlayerIds.add(m.player1Id);
    if (!status.player2 && m.player2Id) placedPlayerIds.add(m.player2Id);
  }
  const assignCandidates = qualifications.filter((q) => !placedPlayerIds.has(q.playerId));

  /* Other confirmed, non-completed, non-BYE slots in the same round. */
  const swapSlotsCandidates: SwapSlotsCandidate[] = [];
  for (const m of matches) {
    if (m.id === match.id || m.completed || m.isBye || m.round !== match.round) continue;
    const status = getFinalsSlotStatus(m.matchNumber, matches, bracketStructure);
    if (!status.player1) {
      swapSlotsCandidates.push({
        key: `${m.id}-1`,
        matchId: m.id,
        matchNumber: m.matchNumber,
        slot: 1,
        version: m.version,
        player: m.player1,
      });
    }
    if (!status.player2) {
      swapSlotsCandidates.push({
        key: `${m.id}-2`,
        matchId: m.id,
        matchNumber: m.matchNumber,
        slot: 2,
        version: m.version,
        player: m.player2,
      });
    }
  }

  const runSlotEdit = async (slotEdit: Record<string, unknown>) => {
    setSaving(true);
    try {
      const response = await fetch(finalsApiPath, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: match.id, slotEdit }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        toast.error(error?.error || tf('slotEditFailed'));
        return;
      }
      toast.success(tf('slotEditSuccess'));
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error(tf('slotEditFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSwapSameMatch = () => {
    /* Swap is symmetric, so "Swap A and B" reads identically before and
     * after — the summary must instead show which player ends up in which
     * numbered slot, or it conveys no information about the actual change. */
    setPending({
      before: tf('slotEditSlotSummary', { p1: playerLabel(match.player1), p2: playerLabel(match.player2) }),
      after: tf('slotEditSlotSummary', { p1: playerLabel(match.player2), p2: playerLabel(match.player1) }),
      slotEdit: { op: 'swap', expectedVersion: match.version },
    });
  };

  const handleAssign = () => {
    if (!selectedPlayerId) return;
    const candidate = assignCandidates.find((c) => c.playerId === selectedPlayerId);
    setPending({
      before: playerLabel(currentPlayer),
      after: playerLabel(candidate?.player) || selectedPlayerId,
      slotEdit: { op: 'assign', slot, playerId: selectedPlayerId, expectedVersion: match.version },
    });
  };

  const handleSwapSlots = () => {
    const target = swapSlotsCandidates.find((c) => c.key === selectedTargetKey);
    if (!target) return;
    setPending({
      before: `M${match.matchNumber}: ${playerLabel(currentPlayer)} / M${target.matchNumber}: ${playerLabel(target.player)}`,
      after: `M${match.matchNumber}: ${playerLabel(target.player)} / M${target.matchNumber}: ${playerLabel(currentPlayer)}`,
      slotEdit: {
        op: 'swapSlots',
        slot,
        targetMatchId: target.matchId,
        targetSlot: target.slot,
        expectedVersion: match.version,
        targetExpectedVersion: target.version,
      },
    });
  };

  const handleConfirmPending = () => {
    if (!pending) return;
    runSlotEdit(pending.slotEdit);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="slot-edit-dialog">
        <DialogHeader>
          <DialogTitle>{tf('slotEditDialogTitle', { matchNumber: match.matchNumber })}</DialogTitle>
          <DialogDescription>{tf('slotEditCurrentPlayer', { name: playerLabel(currentPlayer) })}</DialogDescription>
        </DialogHeader>

        {pending ? (
          <div className="space-y-3 py-2" data-testid="slot-edit-confirm-summary">
            <p className="text-sm font-medium">{tf('slotEditConfirmTitle')}</p>
            <p className="text-sm text-muted-foreground">{tf('slotEditConfirmBefore', { value: pending.before })}</p>
            <p className="text-sm text-muted-foreground">{tf('slotEditConfirmAfter', { value: pending.after })}</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 border-b pb-2">
              <Button
                type="button"
                size="sm"
                variant={tab === 'swap' ? 'default' : 'outline'}
                onClick={() => setTab('swap')}
              >
                {tf('slotEditTabSwap')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={tab === 'assign' ? 'default' : 'outline'}
                onClick={() => setTab('assign')}
              >
                {tf('slotEditTabAssign')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={tab === 'swapSlots' ? 'default' : 'outline'}
                onClick={() => setTab('swapSlots')}
              >
                {tf('slotEditTabSwapSlots')}
              </Button>
            </div>

            {tab === 'swap' && (
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">
                  {tf('slotEditSwapDesc', { p1: playerLabel(match.player1), p2: playerLabel(match.player2) })}
                </p>
                <Button
                  type="button"
                  onClick={handleSwapSameMatch}
                  disabled={saving}
                  data-testid="slot-edit-swap-confirm"
                >
                  {tf('slotEditSwapConfirm')}
                </Button>
              </div>
            )}

            {tab === 'assign' && (
              <div className="space-y-3 py-2">
                {loadingQuals ? (
                  <p className="text-sm text-muted-foreground">{tf('slotEditLoadingCandidates')}</p>
                ) : assignCandidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tf('slotEditNoCandidates')}</p>
                ) : (
                  <select
                    className="w-full border rounded px-2 py-1 text-sm bg-background"
                    value={selectedPlayerId}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                    data-testid="slot-edit-assign-select"
                  >
                    <option value="">{tf('slotEditSelectPlayer')}</option>
                    {assignCandidates.map((c) => (
                      <option key={c.playerId} value={c.playerId}>
                        {playerLabel(c.player) || c.playerId}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  type="button"
                  onClick={handleAssign}
                  disabled={saving || !selectedPlayerId}
                  data-testid="slot-edit-assign-confirm"
                >
                  {tf('slotEditAssignConfirm')}
                </Button>
              </div>
            )}

            {tab === 'swapSlots' && (
              <div className="space-y-3 py-2">
                {swapSlotsCandidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tf('slotEditNoCandidates')}</p>
                ) : (
                  <select
                    className="w-full border rounded px-2 py-1 text-sm bg-background"
                    value={selectedTargetKey}
                    onChange={(e) => setSelectedTargetKey(e.target.value)}
                    data-testid="slot-edit-swapslots-select"
                  >
                    <option value="">{tf('slotEditSelectSlot')}</option>
                    {swapSlotsCandidates.map((c) => (
                      <option key={c.key} value={c.key}>
                        M{c.matchNumber} — {playerLabel(c.player)}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  type="button"
                  onClick={handleSwapSlots}
                  disabled={saving || !selectedTargetKey}
                  data-testid="slot-edit-swapslots-confirm"
                >
                  {tf('slotEditSwapSlotsConfirm')}
                </Button>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          {pending ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPending(null)}
                disabled={saving}
                data-testid="slot-edit-confirm-back"
              >
                {tf('slotEditBack')}
              </Button>
              <Button
                type="button"
                onClick={handleConfirmPending}
                disabled={saving}
                data-testid="slot-edit-confirm-final"
              >
                {tf('slotEditConfirmButton')}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {tf('slotEditCancel')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
