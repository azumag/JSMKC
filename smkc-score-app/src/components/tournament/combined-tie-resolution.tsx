'use client';

import { QualificationPlayoffManager } from '@/components/tournament/qualification-playoff-manager';
import { TieWarningBanner } from '@/components/tournament/tie-warning-banner';
import {
  buildPlayoffRankAssignments,
  collectPlayoffGroups,
  filterActiveTiedIds,
  findUnresolvedTies,
} from '@/lib/ranking-utils';

export interface CombinedTieEntry {
  id: string;
  _autoRank: number;
  mp: number;
  combinedRankOverride: number | null;
  player: { nickname: string };
}

export interface CombinedRankOverrideUpdate {
  qualificationId: string;
  combinedRankOverride: number | null;
}

interface CombinedTieResolutionProps<T extends CombinedTieEntry> {
  rankings: T[];
  isAdmin: boolean;
  onSave: (updates: CombinedRankOverrideUpdate[]) => Promise<boolean>;
  onBroadcast?: (
    player1Name: string,
    player2Name: string,
    matchInfo?: {
      matchLabel?: string;
      player1Wins?: number | null;
      player2Wins?: number | null;
      matchFt?: number | null;
    },
  ) => Promise<boolean>;
}

/** Complete cross-group ties are resolved by a recorded sudden-death order. */
export function CombinedTieResolution<T extends CombinedTieEntry>({
  rankings,
  isAdmin,
  onSave,
  onBroadcast,
}: CombinedTieResolutionProps<T>) {
  const overrideEntries = rankings.map((entry) => ({
    ...entry,
    rankOverride: entry.combinedRankOverride,
  }));
  const activeTiedIds = filterActiveTiedIds(findUnresolvedTies(overrideEntries), rankings);
  const groups = collectPlayoffGroups(overrideEntries, activeTiedIds).map((entries) => ({
    id: `combined-${entries[0]?._autoRank ?? 0}`,
    rank: entries[0]?._autoRank ?? 0,
    players: entries.map((entry) => ({
      id: entry.id,
      nickname: entry.player.nickname,
      _autoRank: entry._autoRank,
      rankOverride: entry.combinedRankOverride,
    })),
  }));

  return (
    <>
      <TieWarningBanner hasTies={activeTiedIds.size > 0} isAdmin={isAdmin} />
      <QualificationPlayoffManager
        groups={groups}
        isAdmin={isAdmin}
        onSave={async (entries) =>
          onSave(
            buildPlayoffRankAssignments(entries).map((entry) => ({
              qualificationId: entry.id,
              combinedRankOverride: entry.rankOverride,
            })),
          )
        }
        onBroadcast={onBroadcast}
      />
    </>
  );
}
