/**
 * Alert UI Component
 *
 * A component for displaying important messages or notifications inline.
 * Built with class-variance-authority (CVA) for type-safe variant management.
 *
 * Uses React.forwardRef to support ref forwarding, which is needed when
 * the alert is used within animation libraries or needs programmatic
 * scroll-into-view behavior (e.g., scrolling to an error alert on form submission).
 *
 * Used throughout the JSMKC app for:
 * - Form validation error summaries
 * - Tournament status notifications
 * - API error messages
 * - Success confirmations after score submissions
 *
 * Layout note: When an SVG icon is placed as a direct child, the alert
 * positions it absolutely at top-left (left-4, top-4) and shifts subsequent
 * content to the right via `[&>svg~*]:pl-7`. This enables a clean icon+text
 * layout without explicit flexbox wrappers.
 */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * CVA variant definitions for the Alert component.
 *
 * Base styles include:
 * - Full-width with rounded border and padding
 * - Absolute positioning support for leading SVG icons
 * - Icon-adjacent content receives left padding to avoid overlap
 */
const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
  {
    variants: {
      /**
       * Visual variant styles:
       * - default: Standard background with foreground text, for informational alerts
       * - destructive: Red border and text for error/warning alerts, with icon
       *   color matching the destructive theme for visual consistency
       */
      variant: {
        default: "bg-background text-foreground",
        destructive:
          "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
      },
    },
    /** Default variant for informational alerts */
    defaultVariants: {
      variant: "default",
    },
  }
)

/**
 * Alert container component.
 * Uses role="alert" for screen reader announcement on render.
 * Forwards ref for programmatic DOM access (scroll, focus, etc.).
 */
const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

/**
 * Alert title component.
 * Renders as an h5 heading for semantic hierarchy within the alert.
 * Uses tight leading (leading-none) and tracking for a compact, bold appearance.
 * The mb-1 margin creates minimal spacing before the description text.
 */
const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

/**
 * Alert description component.
 * Renders as a div to support rich content (paragraphs, links, lists).
 * Uses text-sm for smaller body text, with relaxed line-height for
 * paragraph children to improve readability of longer messages.
 */
const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
