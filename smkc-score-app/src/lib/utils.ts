/**
 * Tailwind CSS Class-Name Utilities
 *
 * Provides the cn() helper that merges CSS class names with proper
 * Tailwind conflict resolution. It combines two libraries:
 * - clsx: conditional class-name joining (truthy/falsy filtering)
 * - tailwind-merge: intelligent deduplication of Tailwind utilities
 *   so that later classes override earlier conflicting ones
 *    (e.g., cn('px-2', 'px-4') => 'px-4')
 *
 * Usage:
 *   import { cn } from '@/lib/utils';
 *   <div className={cn('p-4 text-sm', isActive && 'bg-blue-500')} />
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
