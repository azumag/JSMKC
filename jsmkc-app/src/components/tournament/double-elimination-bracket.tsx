"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Player {
  id: string;
  name: string;
  nickname: string;
}

interface BMMatch {
  id: string;
  matchNumber: number;
  round: string | null;
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
  completed: boolean;
  player1: Player;
  player2: Player;
}

interface BracketMatch {
  matchNumber: number;
  round: string;
  bracket: "winners" | "losers" | "grand_final";
  player1Seed?: number;
  player2Seed?: number;
}

interface DoubleEliminationBracketProps {
  matches: BMMatch[];
  bracketStructure: BracketMatch[];
  roundNames: Record<string, string>;
  onMatchClick?: (match: BMMatch) => void;
  seededPlayers?: { seed: number; playerId: string; player: Player }[];
}

function MatchCard({
  match,
  bracketMatch,
  seededPlayers,
  onClick,
  isTBD,
}: {
  match?: BMMatch;
  bracketMatch: BracketMatch;
  seededPlayers?: { seed: number; playerId: string; player: Player }[];
  onClick?: () => void;
  isTBD: boolean;
}) {
  const seededPlayer1 = bracketMatch.player1Seed
    ? seededPlayers?.find((p) => p.seed === bracketMatch.player1Seed)?.player
    : undefined;
  const seededPlayer2 = bracketMatch.player2Seed
    ? seededPlayers?.find((p) => p.seed === bracketMatch.player2Seed)?.player
    : undefined;

  const player1: Player | undefined = match?.player1 || seededPlayer1;
  const player2: Player | undefined = match?.player2 || seededPlayer2;

  const isWinner1 = match?.completed && match.score1 >= 3;
  const isWinner2 = match?.completed && match.score2 >= 3;

  // Check if this is a future match (players not yet determined from previous rounds)
  const isFirstRound =
    bracketMatch.round === "winners_qf" || bracketMatch.round === "losers_r1";
  const showTBD = !isFirstRound && isTBD;

  return (
    <div
      className={cn(
        "border rounded-lg p-2 bg-card min-w-[180px] cursor-pointer hover:border-primary transition-colors",
        match?.completed && "border-green-500/50"
      )}
      onClick={onClick}
    >
      <div className="text-xs text-muted-foreground mb-1">
        M{bracketMatch.matchNumber}
      </div>
      <div
        className={cn(
          "flex justify-between items-center py-1 px-2 rounded",
          isWinner1 && "bg-green-500/20 font-bold"
        )}
      >
        <span className="flex items-center gap-1">
          {bracketMatch.player1Seed && (
            <span className="text-xs text-muted-foreground">
              [{bracketMatch.player1Seed}]
            </span>
          )}
          <span className={showTBD ? "text-muted-foreground" : ""}>
            {showTBD ? "TBD" : player1?.nickname || "TBD"}
          </span>
        </span>
        <span className="font-mono">
          {match?.completed ? match.score1 : "-"}
        </span>
      </div>
      <div
        className={cn(
          "flex justify-between items-center py-1 px-2 rounded",
          isWinner2 && "bg-green-500/20 font-bold"
        )}
      >
        <span className="flex items-center gap-1">
          {bracketMatch.player2Seed && (
            <span className="text-xs text-muted-foreground">
              [{bracketMatch.player2Seed}]
            </span>
          )}
          <span className={showTBD ? "text-muted-foreground" : ""}>
            {showTBD ? "TBD" : player2?.nickname || "TBD"}
          </span>
        </span>
        <span className="font-mono">
          {match?.completed ? match.score2 : "-"}
        </span>
      </div>
    </div>
  );
}

function BracketSection({
  title,
  children,
  variant = "default",
}: {
  title: string;
  children: React.ReactNode;
  variant?: "default" | "losers" | "final";
}) {
  return (
    <Card
      className={cn(
        variant === "losers" && "border-orange-500/30",
        variant === "final" && "border-yellow-500/50"
      )}
    >
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center gap-2">
          {title}
          {variant === "losers" && (
            <Badge variant="outline" className="text-orange-500 border-orange-500">
              Losers
            </Badge>
          )}
          {variant === "final" && (
            <Badge variant="outline" className="text-yellow-500 border-yellow-500">
              Grand Final
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function DoubleEliminationBracket({
  matches,
  bracketStructure,
  roundNames,
  onMatchClick,
  seededPlayers,
}: DoubleEliminationBracketProps) {
  const getMatch = (matchNumber: number) =>
    matches.find((m) => m.matchNumber === matchNumber);

  const getBracketMatch = (matchNumber: number) =>
    bracketStructure.find((b) => b.matchNumber === matchNumber);

  // Check if a match should show TBD (players not yet determined)
  const isTBD = (matchNumber: number) => {
    const match = getMatch(matchNumber);
    if (!match) return true;
    // For first round matches, never TBD
    const bracket = getBracketMatch(matchNumber);
    if (bracket?.round === "winners_qf") return false;
    // For other matches, check if both players are actually set from previous results
    return !match.completed && match.player1Id === match.player2Id;
  };

  // Winners Bracket rounds
  const winnersQF = bracketStructure.filter((b) => b.round === "winners_qf");
  const winnersSF = bracketStructure.filter((b) => b.round === "winners_sf");
  const winnersFinal = bracketStructure.filter(
    (b) => b.round === "winners_final"
  );

  // Losers Bracket rounds
  const losersR1 = bracketStructure.filter((b) => b.round === "losers_r1");
  const losersR2 = bracketStructure.filter((b) => b.round === "losers_r2");
  const losersR3 = bracketStructure.filter((b) => b.round === "losers_r3");
  const losersSF = bracketStructure.filter((b) => b.round === "losers_sf");
  const losersFinal = bracketStructure.filter((b) => b.round === "losers_final");

  // Grand Final
  const grandFinal = bracketStructure.filter((b) => b.round === "grand_final");
  const grandFinalReset = bracketStructure.filter(
    (b) => b.round === "grand_final_reset"
  );

  return (
    <div className="space-y-6">
      {/* Winners Bracket */}
      <BracketSection title="Winners Bracket">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
          {/* QF */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Quarter Finals
            </h4>
            <div className="flex flex-col gap-2">
              {winnersQF.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>

          {/* SF */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Semi Finals
            </h4>
            <div className="flex flex-col gap-2 justify-center h-full">
              {winnersSF.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>

          {/* Final */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Final</h4>
            <div className="flex flex-col gap-2 justify-center h-full">
              {winnersFinal.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>
        </div>
      </BracketSection>

      {/* Losers Bracket */}
      <BracketSection title="Losers Bracket" variant="losers">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
          {/* R1 */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Round 1
            </h4>
            <div className="flex flex-col gap-2">
              {losersR1.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>

          {/* R2 */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Round 2
            </h4>
            <div className="flex flex-col gap-2">
              {losersR2.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>

          {/* R3 */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Round 3
            </h4>
            <div className="flex flex-col gap-2">
              {losersR3.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>

          {/* SF */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Semi Final
            </h4>
            <div className="flex flex-col gap-2">
              {losersSF.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>

          {/* Final */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Final</h4>
            <div className="flex flex-col gap-2">
              {losersFinal.map((b) => (
                <MatchCard
                  key={b.matchNumber}
                  match={getMatch(b.matchNumber)}
                  bracketMatch={b}
                  seededPlayers={seededPlayers}
                  onClick={() => {
                    const match = getMatch(b.matchNumber);
                    if (match && onMatchClick) onMatchClick(match);
                  }}
                  isTBD={isTBD(b.matchNumber)}
                />
              ))}
            </div>
          </div>
        </div>
      </BracketSection>

      {/* Grand Final */}
      <BracketSection title="Grand Final" variant="final">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Grand Final
            </h4>
            {grandFinal.map((b) => (
              <MatchCard
                key={b.matchNumber}
                match={getMatch(b.matchNumber)}
                bracketMatch={b}
                seededPlayers={seededPlayers}
                onClick={() => {
                  const match = getMatch(b.matchNumber);
                  if (match && onMatchClick) onMatchClick(match);
                }}
                isTBD={isTBD(b.matchNumber)}
              />
            ))}
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Reset (if needed)
            </h4>
            {grandFinalReset.map((b) => (
              <MatchCard
                key={b.matchNumber}
                match={getMatch(b.matchNumber)}
                bracketMatch={b}
                seededPlayers={seededPlayers}
                onClick={() => {
                  const match = getMatch(b.matchNumber);
                  if (match && onMatchClick) onMatchClick(match);
                }}
                isTBD={isTBD(b.matchNumber)}
              />
            ))}
          </div>
        </div>
      </BracketSection>
    </div>
  );
}

export default DoubleEliminationBracket;
