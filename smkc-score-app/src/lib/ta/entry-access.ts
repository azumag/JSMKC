export interface TaEntryAccessEntry {
  stage: string;
  playerId: string;
  partnerId: string | null;
}

export interface TaEntryAccessContext {
  isAdmin?: boolean | null;
  currentPlayerId?: string | null;
  frozenStages?: readonly string[];
}

export function canEditTaEntry(
  entry: TaEntryAccessEntry,
  context: TaEntryAccessContext,
): boolean {
  if (context.frozenStages?.includes(entry.stage)) return false;
  if (context.isAdmin) return true;

  const currentPlayerId = context.currentPlayerId;
  if (!currentPlayerId) return false;

  return entry.playerId === currentPlayerId || entry.partnerId === currentPlayerId;
}
