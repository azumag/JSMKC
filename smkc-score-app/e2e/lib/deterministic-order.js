function orderTaEntriesForDeterministicResultSlots(entries) {
  /* TC-1033 assigns result slots by index. API/database ordering is not a stable
   * contract, so use an explicit locale/options pair for deterministic,
   * human-natural playerId ordering across local Node and GitHub Actions. */
  return [...entries].sort((a, b) => String(a.playerId).localeCompare(
    String(b.playerId),
    'en',
    { numeric: true, sensitivity: 'base' },
  ));
}

module.exports = {
  orderTaEntriesForDeterministicResultSlots,
};
