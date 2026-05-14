function collectEliminationOrder(rounds) {
  const order = [];
  for (const round of rounds ?? []) {
    for (const playerId of round?.eliminatedIds ?? []) {
      if (typeof playerId === 'string' && playerId.length > 0) {
        order.push(playerId);
      }
    }
  }
  return order;
}

function getRankedScores(recalcBody) {
  return recalcBody?.data?.scores ?? recalcBody?.scores ?? [];
}

function getTaFinalsPoints(scores, playerId) {
  return scores.find((score) => score.playerId === playerId)?.taFinalsPoints ?? 0;
}

function evaluateTaFlowRankAssertion({ entries, phase3Status = 200, phase3Rounds, recalcStatus, recalcBody }) {
  if (phase3Status < 200 || phase3Status >= 300) {
    return { status: 'FAIL', detail: `phase3 rounds fetch failed: ${phase3Status}` };
  }

  if (recalcStatus < 200 || recalcStatus >= 300) {
    return { status: 'FAIL', detail: `recalculate failed: ${recalcStatus}` };
  }

  const eliminationOrder = collectEliminationOrder(phase3Rounds);
  if (eliminationOrder.length < 2) {
    return {
      status: 'SKIP',
      detail: 'not enough phase3 elimination data to compare TA finals order',
    };
  }

  const ranked = getRankedScores(recalcBody);
  const champion = entries.find((entry) => entry.rank === 1);
  const championPoints = getTaFinalsPoints(ranked, champion?.playerId);
  const maxTaFinalsPoints = Math.max(0, ...ranked.map((score) => score.taFinalsPoints ?? 0));

  /* Keep the assertion coupled to the observable ranking contract, not the
   * current point table value.  The table has historically changed during
   * tournament-format work; requiring "positive and highest" still proves
   * the rank=1 survivor receives the winner slot without making this E2E
   * fail for an intentional scoring-scale update. */
  if (championPoints <= 0) {
    return {
      status: 'FAIL',
      detail: `champion (rank 1) expected positive TA finals points, got ${championPoints}`,
    };
  }
  if (championPoints !== maxTaFinalsPoints) {
    return {
      status: 'FAIL',
      detail: `champion (rank 1) expected highest TA finals points (${maxTaFinalsPoints}), got ${championPoints}`,
    };
  }

  const lastEliminatedId = eliminationOrder[eliminationOrder.length - 1];
  const earliestEliminatedId = eliminationOrder[0];
  const lastEliminatedPoints = getTaFinalsPoints(ranked, lastEliminatedId);
  const earliestEliminatedPoints = getTaFinalsPoints(ranked, earliestEliminatedId);

  if (lastEliminatedPoints <= earliestEliminatedPoints) {
    return {
      status: 'FAIL',
      detail: `late-eliminated player (${lastEliminatedPoints} pts) should outrank earliest eliminated (${earliestEliminatedPoints} pts)`,
    };
  }

  return { status: 'PASS', detail: '' };
}

module.exports = {
  collectEliminationOrder,
  evaluateTaFlowRankAssertion,
};
