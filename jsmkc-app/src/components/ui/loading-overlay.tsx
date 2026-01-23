"use client";

import { Loader2 } from "lucide-react";

export interface LoadingOverlayProps {
  isOpen: boolean;
  message?: string;
}

/**
 * Loading overlay component for blocking operations
 * Prevents user interaction while operation is in progress
 */
export function LoadingOverlay({ isOpen, message }: LoadingOverlayProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Loading"
    >
      <div className="bg-card border rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <div className="space-y-2 text-center">
            <h3 className="text-lg font-medium">
              {message || "Processing..."}
            </h3>
            <p className="text-sm text-muted-foreground">
              Please wait while we complete this operation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
