import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface CombinedStandingsEntry {
  id: string;
  _autoRank: number;
  group: string;
  mp: number;
  wins: number;
  ties: number;
  losses: number;
  points: number;
  score: number;
  player: {
    nickname: string;
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
  qualificationPointsTooltip?: string;
}

interface CombinedStandingsTableProps<T extends CombinedStandingsEntry> {
  labels: CombinedStandingsTableLabels;
  rankings: T[];
  getGroupLabel: (group: string) => string;
  getQualificationPoints: (entry: T) => number;
}

export function CombinedStandingsTable<T extends CombinedStandingsEntry>({
  labels,
  rankings,
  getGroupLabel,
  getQualificationPoints,
}: CombinedStandingsTableProps<T>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
        <CardDescription>{labels.playersCount}</CardDescription>
      </CardHeader>
      <CardContent>
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
                <TableCell className="font-medium">{entry.player.nickname}</TableCell>
                <TableCell className="text-center">{entry.mp}</TableCell>
                <TableCell className="text-center">{entry.wins}</TableCell>
                <TableCell className="text-center">{entry.ties}</TableCell>
                <TableCell className="text-center">{entry.losses}</TableCell>
                <TableCell className="text-center">
                  {entry.points > 0 ? `+${entry.points}` : entry.points}
                </TableCell>
                <TableCell className="text-center font-bold">{entry.score}</TableCell>
                <TableCell className="text-center font-bold">
                  {getQualificationPoints(entry)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
