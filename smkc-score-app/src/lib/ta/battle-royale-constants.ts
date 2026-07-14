export const TA_BATTLE_ROYALE_MAX_PLAYERS = 100;
export const TA_BATTLE_ROYALE_ENTRY_CHUNK = 14;

// Per-round life-loss override (TA battle royale Phase 3 only). Default is 1;
// admins may configure a specific round to cost more lives. Bounded well
// under the 10-life starting count so a single round cannot be configured to
// skip elimination logic entirely.
export const TA_ROUND_LIFE_LOSS_MIN = 1;
export const TA_ROUND_LIFE_LOSS_MAX = 9;
