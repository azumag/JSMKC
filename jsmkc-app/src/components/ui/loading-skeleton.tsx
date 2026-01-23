"use client";

import { cn } from "@/lib/utils";

export interface SkeletonProps {
  className?: string;
}

/**
 * Skeleton placeholder component for content loading
 * Provides visual feedback while content is being fetched
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

export interface CardSkeletonProps {
  className?: string;
}

/**
 * Skeleton card component for card-based content loading
 * Maintains card structure while loading data
 */
export function CardSkeleton({ className }: CardSkeletonProps) {
  return (
    <div className={cn("rounded-lg border bg-card text-card-foreground shadow", className)}>
      <div className="p-6">
        <div className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

/**
 * Skeleton table component for table-based content loading
 * Maintains table structure while loading data
 */
export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-4">
        {[...Array(columns)].map((_, i) => (
          <div key={i} className="flex-1 h-4" />
        ))}
      </div>
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
