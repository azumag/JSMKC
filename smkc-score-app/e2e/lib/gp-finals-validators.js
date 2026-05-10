function isGpFinalsFt3Round(round) {
  return ['winners_final', 'losers_sf', 'losers_final', 'grand_final', 'grand_final_reset'].includes(round);
}

function validateGpFinalsAssignedCupSequences(matches) {
  const errors = [];
  const sequencesByRound = new Map();

  for (const match of matches) {
    const round = match.round;
    const assignedCups = Array.isArray(match.assignedCups) ? match.assignedCups : [];

    if (!round) continue;
    if (assignedCups.length === 0) {
      errors.push(`M${match.matchNumber || match.id}: assignedCups is empty`);
      continue;
    }
    if (match.cup !== assignedCups[0]) {
      errors.push(`M${match.matchNumber || match.id}: cup=${match.cup} first=${assignedCups[0]}`);
    }

    const key = JSON.stringify(assignedCups);
    if (!sequencesByRound.has(round)) sequencesByRound.set(round, new Set());
    sequencesByRound.get(round).add(key);

    if (isGpFinalsFt3Round(round)) {
      if (assignedCups.length !== 5) {
        errors.push(`M${match.matchNumber || match.id}: ${round} expected 5 assigned cups, got ${assignedCups.length}`);
      }
      if (new Set(assignedCups.slice(0, 4)).size !== Math.min(4, assignedCups.length)) {
        errors.push(`M${match.matchNumber || match.id}: ${round} repeats within first 4 assigned cups`);
      }
    } else {
      if (assignedCups.length > 3) {
        errors.push(`M${match.matchNumber || match.id}: ${round} expected <=3 assigned cups, got ${assignedCups.length}`);
      }
      if (new Set(assignedCups).size !== assignedCups.length) {
        errors.push(`M${match.matchNumber || match.id}: ${round} repeats assigned cups`);
      }
    }
  }

  for (const [round, sequences] of sequencesByRound.entries()) {
    if (sequences.size !== 1) {
      errors.push(`${round}: divergent assignedCups sequences`);
    }
  }

  return errors;
}

module.exports = {
  isGpFinalsFt3Round,
  validateGpFinalsAssignedCupSequences,
};
