/**
 * Button — Paddock Editorial.
 *
 * API matches the original shadcn/ui surface (variant + size + asChild) so
 * every existing call site continues to work. Visuals lean on uppercase
 * Manrope letterforms with tight tracking, sharp 0.25rem corners, and a
 * Racing-Red default fill so primary actions always read as the lead.
 *
 * Variants:
 *  - default: Racing red, white-paper text, hover lifts via ring shadow.
 *  - destructive: Same red as default but stays loud in dark mode.
 *  - outline: 1.5px charcoal border, transparent fill; hover swaps to
 *    accent background to telegraph interactivity.
 *  - secondary: Carbon-gray fill for tertiary admin actions.
 *  - ghost: No chrome until hovered, used for icon-bar/utility actions.
 *  - link: Underline-on-hover textual link (kept for inline CTAs).
 */
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/50",
        outline:
          "border border-foreground/30 bg-transparent text-foreground hover:bg-accent/40 hover:border-foreground/60 dark:border-foreground/30",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70 border border-foreground/10",
        ghost:
          "text-foreground hover:bg-accent/40",
        link:
          "text-primary underline-offset-4 decoration-2 hover:underline",
      },
      size: {
        default: "h-9 px-4 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5 text-xs",
        lg: "h-10 px-5 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

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
