/**
 * Loading Overlay Component
 *
 * A full-screen modal overlay for blocking user interaction during
 * long-running operations. Displays a centered card with a spinner
 * and customizable message.
 *
 * Marked as "use client" because it is conditionally rendered based
 * on client-side state and requires browser DOM for the fixed overlay.
 *
 * Used in the JSMKC app for:
 * - Score submission operations (preventing double-submit)
 * - Tournament state transitions (e.g., moving from qualification to finals)
 * - Bracket generation and recalculation
 *
 * Design decisions:
 * - Uses bg-background/80 + backdrop-blur for a frosted glass effect
 *   that maintains spatial context while preventing interaction
 * - z-50 ensures it renders above all content including dialogs
 * - aria-modal="true" traps focus within the overlay for accessibility
 * - Returns null when isOpen is false to avoid unnecessary DOM nodes
 */
"use client";

import { Loader2 } from "lucide-react";

/**
 * Props for the LoadingOverlay component.
 *
 * @property isOpen - Controls visibility. When false, the component
 *   renders nothing (returns null), avoiding invisible DOM nodes.
 * @property message - Optional custom message displayed below the spinner.
 *   Defaults to "Processing..." when not provided.
 */
export interface LoadingOverlayProps {
  isOpen: boolean;
  message?: string;
}

/**
 * Full-screen loading overlay with spinner and message.
 *
 * Renders a fixed overlay covering the entire viewport with a centered
 * card containing:
 * - An animated spinner (Loader2 from lucide-react)
 * - A primary message (customizable via props)
 * - A secondary helper message asking the user to wait
 *
 * The overlay prevents all user interaction with underlying content
 * by covering the viewport with a semi-transparent backdrop.
 */
export function LoadingOverlay({ isOpen, message }: LoadingOverlayProps) {
  /** Early return when not open -- no DOM node rendered at all */
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Loading"
    >
      {/* Centered card with border and shadow for visual elevation */}
      <div className="bg-card border rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
        <div className="flex flex-col items-center gap-4">
          {/* Animated spinner icon */}
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <div className="space-y-2 text-center">
            {/* Primary message: customizable, defaults to "Processing..." */}
            <h3 className="text-lg font-medium">
              {message || "Processing..."}
            </h3>
            {/* Secondary helper text asking the user to wait */}
            <p className="text-sm text-muted-foreground">
              Please wait while we complete this operation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
