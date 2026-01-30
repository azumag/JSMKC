/**
 * Input UI Component
 *
 * A styled text input component that wraps the native HTML <input> element.
 * This is not marked "use client" because it is a simple wrapper with no
 * client-side state or effects -- it can be used in both server and client components.
 *
 * Used throughout the JSMKC app for:
 * - Score entry fields (time values in Time Attack mode)
 * - Player name search and filtering
 * - Tournament configuration forms
 *
 * Design decisions:
 * - Uses native <input> rather than Radix primitive because standard inputs
 *   don't need accessibility primitives beyond native HTML attributes.
 * - Supports file input styling via `file:` Tailwind variants for upload fields.
 * - Includes aria-invalid styling for form validation integration with react-hook-form.
 */
import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Input component with consistent styling and validation state support.
 *
 * @param className - Additional CSS classes to merge with base input styles
 * @param type - HTML input type (text, number, email, file, etc.)
 *
 * Style breakdown:
 * - Base: transparent background with border, rounded corners, and shadow
 * - Dark mode: slightly tinted background via dark:bg-input/30
 * - Focus: visible ring indicator (3px) with border color change
 * - Validation: destructive ring and border when aria-invalid is set
 * - File: custom file input button styling with inline-flex layout
 * - Disabled: reduced opacity with cursor-not-allowed and no pointer events
 * - Responsive: base text (16px) to prevent iOS zoom, md:text-sm for desktop
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
