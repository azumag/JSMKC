/**
 * Compatibility helpers for BM/MR/GP qualification page clients.
 *
 * Player discovery now belongs to the dialog-owned `usePlayerSearch()` path.
 * Live qualification GET responses provide only the already-assigned players as
 * a bounded `allPlayers` seed, so the normal 3-second qualification poll must
 * not issue a second `/api/players` request.
 */

/**
 * @deprecated Qualification polling no longer loads the global player registry.
 * Keep this async shim temporarily so the three page clients can migrate without
 * changing their polling response contract in the same step.
 */
export async function fetchAllPlayersForSetup<TPlayer>(): Promise<TPlayer[] | null> {
  return null;
}

export function resolveAllPlayers<TPlayer>(
  fetchedPlayers: TPlayer[] | null,
  payloadPlayers: TPlayer[] | null | undefined,
): TPlayer[] {
  return fetchedPlayers ?? payloadPlayers ?? [];
}
