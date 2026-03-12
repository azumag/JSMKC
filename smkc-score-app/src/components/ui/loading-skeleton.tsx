/**
 * Loading Skeleton Components
 *
 * Skeleton placeholder components that provide visual structure during
 * content loading. These components maintain the approximate layout of
 * the content they replace, preventing jarring layout shifts when data
 * arrives (improving Cumulative Layout Shift / CLS performance metric).
 *
 * Marked as "use client" because skeleton components are typically
 * conditionally rendered based on client-side loading state.
 *
 * Three skeleton variants are provided:
 * - Skeleton: Generic rectangular placeholder (base building block)
 * - CardSkeleton: Card-shaped placeholder matching Card component layout
 * - TableSkeleton: Table-shaped placeholder with configurable rows/columns
 *
 * All skeletons use the animate-pulse animation for a subtle breathing
 * effect that indicates content is loading without being distracting.
 */
"use client";

import { cn } from "@/lib/utils";

/**
 * Props for the base Skeleton component.
 * @property className - CSS classes that should include width and height
 *   dimensions (e.g., "h-4 w-3/4") since the skeleton renders as an
 *   empty div that relies on explicit sizing.
 */
export interface SkeletonProps {
  className?: string;
}

/**
 * Base skeleton placeholder component.
 * Renders a pulsing rectangle with muted background and rounded corners.
 * The consumer must provide dimensions via className (h-*, w-*).
 *
 * Accessibility:
 * - role="status" announces the loading state to screen readers
 * - aria-label provides descriptive text for the visual placeholder
 *
 * Example usage:
 * ```tsx
 * <Skeleton className="h-4 w-3/4" />  // Text line placeholder
 * <Skeleton className="h-10 w-10 rounded-full" />  // Avatar placeholder
 * ```
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-muted rounded-md",
        className
      )}
      role="status"
      aria-label="Loading content"
    />
  );
}

/**
 * Props for the CardSkeleton component.
 * @property className - Additional CSS classes for the card container
 */
export interface CardSkeletonProps {
  className?: string;
}

/**
 * Card skeleton placeholder component.
 * Mimics the Card component's visual structure with:
 * - Card border and shadow styling
 * - Three "title-like" skeleton lines (varied widths for realism)
 * - Two "content" skeleton lines below
 *
 * This maintains the approximate height and visual weight of a real
 * card, preventing layout shift when the actual content loads.
 */
export function CardSkeleton({ className }: CardSkeletonProps) {
  return (
    <div className={cn("rounded-lg border bg-card text-card-foreground shadow", className)}>
      <div className="p-6">
        {/* Header area: three lines simulating title and metadata */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        {/* Content area: two lines simulating body text */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}

/**
 * Props for the TableSkeleton component.
 * @property rows - Number of data rows to render (default: 5)
 * @property columns - Number of columns per row (default: 4)
 */
export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

/**
 * Table skeleton placeholder component.
 * Mimics the Table component's visual structure with:
 * - A header row (empty divs maintaining column spacing)
 * - Configurable number of data rows with pulsing cells
 *
 * The flex layout with flex-1 on each cell distributes columns
 * evenly, matching the typical equal-width column layout used in
 * tournament score tables.
 *
 * @param rows - Number of skeleton rows (default 5, matching typical page size)
 * @param columns - Number of columns (default 4, matching common tournament table width)
 */
export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <div className="w-full">
      {/* Header row: empty flex items to establish column structure */}
      <div className="flex justify-between items-center mb-4">
        {[...Array(columns)].map((_, i) => (
          <div key={i} className="flex-1 h-4" />
        ))}
      </div>
      {/* Data rows: pulsing cells matching the column count */}
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex gap-4 mb-2">
          {[...Array(columns)].map((_, j) => (
            <div key={`${i}-${j}`} className="h-12 flex-1 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  );
}
