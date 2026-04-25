/**
 * Badge — Paddock Editorial.
 *
 * Sharp-edged paddock tag instead of a pill. The `flag-*` variants use the
 * shared utility classes from globals.css so status colors stay consistent
 * with the editorial table left-borders and any other status surfacing.
 *
 * Variants:
 *  - default: Racing red, used for the lead/primary highlight.
 *  - secondary: Carbon-gray neutral tag.
 *  - destructive: Loud red for warnings/errors.
 *  - outline: Charcoal-bordered transparent tag.
 *  - flag-active: Green flag — running/active state.
 *  - flag-draft: Yellow/mustard flag — preparing/draft.
 *  - flag-completed: Black-on-paper checker semantics — completed.
 */
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-sm border px-2 py-0.5 text-[11px] font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/85",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/85",
        outline:
          "border-foreground/70 text-foreground bg-transparent [a&]:hover:bg-foreground [a&]:hover:text-background",
        "flag-active":
          "flag-active",
        "flag-draft":
          "flag-draft",
        "flag-completed":
          "flag-completed",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
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
