/**
 * Card UI Component
 *
 * A compound component for card-based layouts, following the shadcn/ui pattern.
 * The Card is composed of multiple sub-components that work together:
 * - Card: The outer container with border, shadow, and rounded corners
 * - CardHeader: Top section for title, description, and optional action
 * - CardTitle: Primary heading text within the header
 * - CardDescription: Secondary descriptive text within the header
 * - CardAction: Optional action element (e.g., button) positioned top-right in header
 * - CardContent: Main body content area
 * - CardFooter: Bottom section for actions or metadata
 *
 * Each sub-component uses data-slot attributes to enable parent-based CSS
 * targeting (e.g., `.border-b` on Card can style `[.border-b]:pb-6` on CardHeader).
 * This avoids prop drilling for layout variants.
 */
import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Card container component.
 * Provides the outer wrapper with rounded border, shadow, and vertical flex layout.
 * The gap-6 ensures consistent spacing between header, content, and footer sections.
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
        className
      )}
      {...props}
    />
  )
}

/**
 * Card header section.
 * Uses CSS Grid with auto-rows to support two-row layouts (title + description)
 * and an optional action column. The `has-data-[slot=card-action]` selector
 * conditionally enables the two-column grid when a CardAction is present,
 * preventing the action from taking up space when absent.
 *
 * The `@container/card-header` enables container queries for responsive
 * header layouts based on the card width rather than viewport width.
 */
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

/**
 * Card title component.
 * Renders as a div (not h1-h6) to avoid heading hierarchy issues when
 * cards are nested or used in varied page contexts. Uses leading-none
 * to tighten line-height for single-line titles.
 */
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

/**
 * Card description component.
 * Provides secondary text below the title in muted color.
 * Uses text-sm for visual hierarchy beneath the title.
 */
function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

/**
 * Card action component.
 * Positioned in the top-right corner of the header grid via CSS Grid placement.
 * - col-start-2: Places it in the second column (action column)
 * - row-span-2: Spans both title and description rows for vertical centering
 * - row-start-1: Anchors to the top of the header
 * This layout allows the action to visually align with the header content
 * without absolute positioning, maintaining flow layout integrity.
 */
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

/**
 * Card content area.
 * The main body of the card. Uses horizontal padding (px-6) matching the
 * header and footer for consistent alignment. No vertical padding is applied
 * to give consumers full control over content spacing.
 */
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

/**
 * Card footer component.
 * Flex container for bottom-aligned actions (e.g., Save/Cancel buttons).
 * The `[.border-t]:pt-6` selector adds top padding when a border-t class
 * is applied to the Card, creating visual separation from the content.
 */
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
