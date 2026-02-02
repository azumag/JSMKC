/**
 * Loading State Type Definitions
 *
 * Provides type-safe loading state management across the JSMKC application.
 * These types are used by loading UI components (LoadingSpinner, LoadingOverlay,
 * LoadingSkeleton) and by data-fetching hooks to communicate loading states
 * to the UI layer.
 *
 * The loading type system distinguishes between different loading contexts
 * to enable appropriate UI feedback:
 * - 'initial': First page load (show skeleton placeholders)
 * - 'data': Background data refresh (show subtle indicator, keep existing content)
 * - 'operation': User-initiated action in progress (show overlay, block interaction)
 * - 'retry': Automatic retry after failure (show retry-specific messaging)
 */

/**
 * Discriminated loading type enum.
 * Each type corresponds to a different UI treatment:
 * - initial: Full-page skeleton loading on first render
 * - data: Inline spinner or subtle loading indicator during refetch
 * - operation: Modal overlay blocking user interaction during mutations
 * - retry: Similar to data but with retry-specific messaging
 */
export type LoadingType = 'initial' | 'data' | 'operation' | 'retry';

/**
 * Loading state interface for component consumption.
 * Used by components to determine whether and how to show loading UI.
 *
 * @property isLoading - Whether any loading is in progress
 * @property loadingType - The specific type of loading (determines UI treatment)
 * @property loadingMessage - Optional custom message to display during loading
 * @property progress - Optional 0-100 progress value for determinate loading bars
 */
export interface LoadingState {
  isLoading: boolean;
  loadingType?: LoadingType;
  loadingMessage?: string;
  progress?: number;
}

/**
 * Loading configuration for initiating a loading state.
 * Used by hooks and data-fetching utilities to describe the loading
 * operation they are beginning.
 *
 * @property type - The loading type category
 * @property message - Optional custom message (overrides default from LoadingMessages)
 * @property progress - Optional initial progress value (0-100)
 */
export interface LoadingConfig {
  type: LoadingType;
  message?: string;
  progress?: number;
}

/**
 * Default human-readable messages for each loading type.
 * These messages are displayed to the user when no custom message is provided.
 * Marked as `as const` for type narrowing -- ensures the values are treated
 * as string literals rather than generic strings.
 */
export const LoadingMessages: Record<LoadingType, string> = {
  initial: 'Loading page...',
  data: 'Loading data...',
  operation: 'Processing...',
  retry: 'Retrying...'
} as const;
