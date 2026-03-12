/**
 * Button UI Component
 *
 * A versatile button component built on top of Radix UI's Slot primitive
 * and class-variance-authority (CVA) for type-safe variant management.
 *
 * Supports 6 visual variants (default, destructive, outline, secondary, ghost, link)
 * and 6 size options (default, sm, lg, icon, icon-sm, icon-lg).
 *
 * The `asChild` prop leverages Radix UI's Slot to merge button styling onto
 * a child element (e.g., wrapping an <a> tag to look like a button) without
 * adding an extra DOM node. This is essential for accessible navigation patterns.
 *
 * Data attributes (data-slot, data-variant, data-size) are included to support
 * parent-based conditional styling via CSS attribute selectors, enabling
 * compound component patterns (e.g., a Card can style nested Buttons differently).
 */
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * CVA variant definitions for the Button component.
 *
 * Base styles include:
 * - Flex layout with centered content and gap for icon+text combinations
 * - Consistent focus-visible ring for keyboard navigation accessibility
 * - aria-invalid styling for form validation error states
 * - SVG child constraints to prevent icons from growing or capturing pointer events
 * - Disabled state using pointer-events-none + reduced opacity
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      /**
       * Visual variant styles:
       * - default: Primary brand color with hover darkening
       * - destructive: Red/danger color for destructive actions (delete, remove)
       * - outline: Bordered button with transparent background, used for secondary actions
       * - secondary: Muted background for less prominent actions
       * - ghost: No background until hovered, used for toolbar/icon buttons
       * - link: Text-only style with underline on hover, mimics hyperlink appearance
       */
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      /**
       * Size variants:
       * - default: Standard 36px height with horizontal padding
       * - sm: Compact 32px height for dense UIs (e.g., table actions)
       * - lg: Larger 40px height for prominent CTAs
       * - icon/icon-sm/icon-lg: Square buttons for icon-only usage
       *
       * The `has-[>svg]` selector reduces padding when the button contains only
       * an SVG icon, ensuring proper visual balance for icon+text vs icon-only cases.
       */
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    /** Default variant and size applied when no explicit props are provided */
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Button component with variant and size support.
 *
 * @param className - Additional CSS classes to merge with variant styles
 * @param variant - Visual style variant (default, destructive, outline, secondary, ghost, link)
 * @param size - Size variant (default, sm, lg, icon, icon-sm, icon-lg)
 * @param asChild - When true, renders as Radix Slot (merges props onto child element)
 *                  instead of a native <button>. Useful for making links look like buttons.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  /**
   * When asChild is true, Slot merges all button props (className, onClick, etc.)
   * onto the single child element, avoiding wrapper div nesting issues.
   * This preserves semantic HTML while maintaining button styling.
   */
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
