/**
 * Badge UI Component
 *
 * A small label component for displaying status indicators, counts, or tags.
 * Built with class-variance-authority (CVA) for type-safe variant management
 * and Radix UI's Slot for polymorphic rendering.
 *
 * Used throughout the JSMKC app for:
 * - Tournament status indicators (active, completed, upcoming)
 * - Player ranking badges
 * - Competition mode labels (TA, BM, MR, GP)
 * - Live/Paused polling status in UpdateIndicator
 *
 * The badge uses rounded-full (pill shape) to visually distinguish it from
 * buttons, and overflow-hidden to handle long text gracefully.
 */
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * CVA variant definitions for the Badge component.
 *
 * Base styles include:
 * - Pill shape with rounded-full
 * - Inline-flex layout for proper alignment in text flow
 * - Small text (text-xs) and compact padding for minimal footprint
 * - SVG icon support with constrained size
 * - Focus ring for keyboard accessibility
 * - overflow-hidden to truncate content that exceeds badge width
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      /**
       * Visual variant styles:
       * - default: Primary brand color, solid background
       * - secondary: Muted background for less prominent indicators
       * - destructive: Red/danger color for error states or warnings
       * - outline: Border-only style for subtle labeling
       *
       * The `[a&]:hover` selector applies hover effects only when the badge
       * is rendered as an anchor element (via asChild), enabling clickable badges
       * while keeping non-interactive badges visually static.
       */
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    /** Default variant applied when no explicit variant prop is provided */
    defaultVariants: {
      variant: "default",
    },
  }
)

/**
 * Badge component with variant support and optional polymorphic rendering.
 *
 * @param className - Additional CSS classes to merge with variant styles
 * @param variant - Visual style variant (default, secondary, destructive, outline)
 * @param asChild - When true, renders as Radix Slot (merges props onto child element)
 *                  instead of a native <span>. Useful for making badges into links.
 */
function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  /**
   * When asChild is true, Slot merges all badge props (className, etc.)
   * onto the single child element. This allows badges to render as
   * anchor tags, buttons, or other elements while maintaining badge styling.
   */
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
