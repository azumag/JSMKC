function normalizeMrStandingsPayload(payload) {
  const data = payload?.data ?? payload ?? {};
  return data.qualifications ?? data.standings ?? [];
}

function assertMrStandingStats(payload, playerId, expected) {
  const standings = normalizeMrStandingsPayload(payload);
  const standing = standings.find((entry) => entry.playerId === playerId);

  if (!standing) {
    throw new Error(`MR standings missing player ${playerId}`);
  }

  const actual = {
    matchesPlayed: standing.matchesPlayed,
    wins: standing.wins,
    ties: standing.ties,
    losses: standing.losses,
    points: standing.points,
    score: standing.score,
  };
  const expectedValues = {
    matchesPlayed: expected.matchesPlayed,
    wins: expected.wins,
    ties: expected.ties,
    losses: expected.losses,
    points: expected.points,
    score: expected.score,
  };

  for (const [field, expectedValue] of Object.entries(expectedValues)) {
    if (actual[field] !== expectedValue) {
      throw new Error(
        `MR standings ${field} for ${playerId}: expected ${expectedValue}, got ${actual[field]}`
      );
    }
  }

  return standing;
}

module.exports = {
  normalizeMrStandingsPayload,
  assertMrStandingStats,
};
