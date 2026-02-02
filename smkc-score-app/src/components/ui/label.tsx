/**
 * Label UI Component
 *
 * An accessible label component built on Radix UI's Label primitive.
 * Provides consistent styling and behavior for form field labels.
 *
 * Marked as "use client" because Radix Label manages click-to-focus
 * behavior that requires browser DOM APIs.
 *
 * Key features:
 * - Clicking the label focuses the associated input (via htmlFor)
 * - Supports disabled state propagation from parent group via
 *   `group-data-[disabled=true]` selector
 * - Supports peer-based disabled state via `peer-disabled` selector
 *   for native disabled inputs that are siblings
 * - select-none prevents text selection on rapid clicks, which is
 *   important for form usability
 *
 * Used by the FormLabel component in form.tsx, which wraps this Label
 * with additional react-hook-form integration (auto htmlFor, error state).
 */
"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"

import { cn } from "@/lib/utils"

/**
 * Label component for form fields.
 *
 * Styling details:
 * - flex + items-center + gap-2: Supports inline icon placement next to label text
 * - text-sm + font-medium: Standard form label typography
 * - leading-none: Tight line-height for single-line labels
 * - select-none: Prevents accidental text selection on click
 * - group-data-[disabled=true]: Responds to parent group's disabled state
 *   (e.g., a fieldset or form group wrapping multiple fields)
 * - peer-disabled: Responds to sibling input's native disabled attribute
 *   (using Tailwind's peer modifier for sibling state styling)
 */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
