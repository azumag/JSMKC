/**
 * Loading Spinner Component
 *
 * An animated rotating spinner component for indicating loading states.
 * Uses the Loader2 icon from lucide-react which provides a circular
 * loading indicator with a gap, creating a clear spinning animation.
 *
 * Marked as "use client" because this component may be dynamically
 * rendered based on client-side state changes (e.g., data fetching).
 *
 * Accessibility:
 * - role="status" announces the loading state to screen readers
 * - aria-live="polite" ensures the loading announcement doesn't
 *   interrupt current screen reader output
 * - aria-label="Loading" provides descriptive text for the visual spinner
 *
 * Used throughout the JSMKC app for:
 * - Inline data loading indicators
 * - Button loading states
 * - Refresh/polling indicators
 */
"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Props for the LoadingSpinner component.
 *
 * @property size - Controls the spinner dimensions:
 *   - "sm": 16x16px, for inline/button usage
 *   - "md": 24x24px, for standalone indicators (default)
 *   - "lg": 32x32px, for page-level loading states
 * @property className - Additional CSS classes for the wrapper container
 */
export interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Animated loading spinner with three size options.
 * The wrapper div centers the spinner using flexbox, allowing it to be
 * placed in any container and automatically center itself.
 * The muted-foreground color ensures the spinner doesn't compete visually
 * with primary content.
 */
export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  /** Maps size prop to Tailwind dimension classes */
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  return (
    <div
      className={cn(
        "flex items-center justify-center",
        className
      )}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <Loader2 className={cn("animate-spin text-muted-foreground", sizeClasses[size])} />
    </div>
  );
}
