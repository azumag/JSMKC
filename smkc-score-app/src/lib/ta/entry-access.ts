export interface TaEntryAccessEntry {
  stage: string;
  playerId: string;
  partnerId: string | null;
}

export interface TaEntryAccessContext {
  isAdmin?: boolean | null;
  currentPlayerId?: string | null;
  frozenStages?: readonly string[];
  taPlayerSelfEdit?: boolean | null;
}

export function canEditTaEntry(
  entry: TaEntryAccessEntry,
  context: TaEntryAccessContext,
): boolean {
  if (context.frozenStages?.includes(entry.stage)) return false;
  if (context.isAdmin) return true;

  const currentPlayerId = context.currentPlayerId;
  if (!currentPlayerId) return false;

  if (entry.partnerId === currentPlayerId) return true;

  return entry.playerId === currentPlayerId && context.taPlayerSelfEdit !== false;
}
