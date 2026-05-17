/**
 * Shared tab values for finals bracket pages.
 *
 * These strings are persisted only in the rendered Radix Tabs value contract,
 * so keeping one exported object prevents BM/GP/MR finals pages from drifting
 * while avoiding a larger abstraction around their mode-specific page logic.
 */
export const BRACKET_TABS = {
  finals: "finals",
  playoff: "playoff",
} as const;

export type BracketTab = typeof BRACKET_TABS[keyof typeof BRACKET_TABS];
