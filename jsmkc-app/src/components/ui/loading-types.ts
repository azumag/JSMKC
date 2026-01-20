/**
 * Loading state type definitions
 * Provides type-safe loading state management across the application
 */

export type LoadingType = 'initial' | 'data' | 'operation' | 'retry';

export interface LoadingState {
  isLoading: boolean;
  loadingType?: LoadingType;
  loadingMessage?: string;
  progress?: number;
}

export interface LoadingConfig {
  type: LoadingType;
  message?: string;
  progress?: number;
}

export const LoadingMessages: Record<LoadingType, string> = {
  initial: 'Loading page...',
  data: 'Loading data...',
  operation: 'Processing...',
  retry: 'Retrying...'
} as const;
