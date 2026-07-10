import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlayerName } from '@/components/ui/player-name';
import {
  CombinedTieResolution,
  type CombinedRankOverrideUpdate,
} from '@/components/tournament/combined-tie-resolution';

export interface CombinedStandingsEntry {
  id: string;
  _autoRank: number;
  combinedRankOverride: number | null;
  group: string;
  mp: number;
  wins: number;
  ties: number;
  losses: number;
  points: number;
  score: number;
  player: {
    nickname: string;
    /** Stored country value (ISO code or legacy name); optional. */
    country?: string | null;
  };
}

export interface CombinedStandingsTableLabels {
  title: string;
  playersCount: string;
  rank: string;
  group: string;
  player: string;
  mp: string;
  wins: string;
  ties: string;
  losses: string;
  plusMinus: string;
  points: string;
  qualificationPoints: string;
  qualificationPointsTooltip: string;
}

interface CombinedStandingsTableProps<T extends CombinedStandingsEntry> {
  labels: CombinedStandingsTableLabels;
  rankings: T[];
  getGroupLabel: (group: string) => string;
  getQualificationPoints: (entry: T) => number;
  /**
   * Active locale for the country-flag tooltip. Threaded from the client
   * parent because this is a presentational component with no hook scope.
   */
  locale: string;
  isAdmin: boolean;
  onCombinedRankOverrideSave: (updates: CombinedRankOverrideUpdate[]) => Promise<boolean>;
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

export function CombinedStandingsTable<T extends CombinedStandingsEntry>({
  labels,
  rankings,
  getGroupLabel,
  getQualificationPoints,
  locale,
  isAdmin,
  onCombinedRankOverrideSave,
  onBroadcast,
}: CombinedStandingsTableProps<T>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
        <CardDescription>{labels.playersCount}</CardDescription>
      </CardHeader>
      <CardContent>
        <CombinedTieResolution
          rankings={rankings}
          isAdmin={isAdmin}
          onSave={onCombinedRankOverrideSave}
          onBroadcast={onBroadcast}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">{labels.rank}</TableHead>
              <TableHead>{labels.group}</TableHead>
              <TableHead>{labels.player}</TableHead>
              <TableHead className="text-center">{labels.mp}</TableHead>
              <TableHead className="text-center">{labels.wins}</TableHead>
              <TableHead className="text-center">{labels.ties}</TableHead>
              <TableHead className="text-center">{labels.losses}</TableHead>
              <TableHead className="text-center">{labels.plusMinus}</TableHead>
              <TableHead className="text-center">{labels.points}</TableHead>
              <TableHead className="text-center" title={labels.qualificationPointsTooltip}>
                {labels.qualificationPoints}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rankings.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-semibold">{entry._autoRank}</TableCell>
                <TableCell>{getGroupLabel(entry.group)}</TableCell>
                <TableCell className="font-medium">
                  <PlayerName player={entry.player} locale={locale} />
                </TableCell>
                <TableCell className="text-center">{entry.mp}</TableCell>
                <TableCell className="text-center">{entry.wins}</TableCell>
                <TableCell className="text-center">{entry.ties}</TableCell>
                <TableCell className="text-center">{entry.losses}</TableCell>
                <TableCell className="text-center">{entry.points > 0 ? `+${entry.points}` : entry.points}</TableCell>
                <TableCell className="text-center font-bold">{entry.score}</TableCell>
                <TableCell className="text-center font-bold">{getQualificationPoints(entry)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
