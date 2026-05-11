export type AssignedCupLabelMatch = {
  assignedCups?: Array<string | null | undefined> | null;
  cup?: string | null;
};

export function getAssignedCupLabelsForMatch(match: AssignedCupLabelMatch): string[] {
  const assigned = Array.isArray(match.assignedCups)
    ? match.assignedCups.filter((cup): cup is string => Boolean(cup))
    : [];

  if (assigned.length > 0) return assigned;
  // Matches created before assignedCups existed still store their display cup here.
  return match.cup ? [match.cup] : [];
}
