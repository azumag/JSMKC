import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Utility for merging Tailwind CSS classes with proper conflict resolution
// clsx handles conditional class names, twMerge resolves Tailwind conflicts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
