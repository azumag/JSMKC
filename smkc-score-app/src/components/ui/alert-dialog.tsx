/**
 * AlertDialog UI Component
 *
 * A modal confirmation dialog built on Radix UI's AlertDialog primitive.
 * Unlike the standard Dialog, AlertDialog is specifically designed for
 * confirmation workflows where the user MUST make an explicit choice
 * (confirm or cancel) -- clicking the overlay does NOT dismiss the dialog.
 *
 * This is critical for JSMKC operations like:
 * - Deleting tournament data (irreversible action)
 * - Resetting player scores
 * - Confirming finals bracket progression
 *
 * Marked as "use client" because Radix AlertDialog manages internal state
 * and requires browser APIs for portal rendering and focus trapping.
 *
 * Key difference from Dialog:
 * - AlertDialog does NOT close on overlay click (requires explicit action)
 * - AlertDialog has Action + Cancel buttons (not just a Close button)
 * - AlertDialog uses alertdialog ARIA role for screen reader semantics
 */
"use client"

import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

/**
 * AlertDialog root component.
 * Directly re-exports Radix's Root -- no additional styling needed
 * as it only manages open/closed state context.
 */
const AlertDialog = AlertDialogPrimitive.Root

/**
 * AlertDialog trigger component.
 * The element that opens the alert dialog when clicked.
 */
const AlertDialogTrigger = AlertDialogPrimitive.Trigger

/**
 * AlertDialog portal component.
 * Renders content into document.body to avoid z-index/overflow issues.
 */
const AlertDialogPortal = AlertDialogPrimitive.Portal

/**
 * AlertDialog overlay component.
 * Semi-transparent backdrop with fade animation.
 * Uses bg-black/80 (80% opacity) which is intentionally darker than
 * the standard Dialog overlay (50%) to emphasize the urgency of the
 * confirmation and draw focus to the dialog content.
 */
const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

/**
 * AlertDialog content component.
 * The main container for the confirmation dialog body.
 * Centered using fixed positioning with translate transforms.
 * Includes slide + zoom animations for polished entrance/exit.
 *
 * The slide-out-to-left-1/2 and slide-out-to-top-[48%] animations
 * create a slight upward movement on close, providing directional
 * feedback that the dialog is being dismissed.
 */
const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    />
  </AlertDialogPortal>
))
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

/**
 * AlertDialog header layout component.
 * Arranges title and description vertically with centered text on mobile
 * and left-aligned text on sm+ screens.
 */
const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
AlertDialogHeader.displayName = "AlertDialogHeader"

/**
 * AlertDialog footer layout component.
 * Arranges action buttons in reversed column on mobile (primary at bottom)
 * and a horizontal row on sm+ screens with end alignment.
 * The sm:space-x-2 provides consistent spacing between buttons.
 */
const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
AlertDialogFooter.displayName = "AlertDialogFooter"

/**
 * AlertDialog title component.
 * Uses Radix's Title primitive for automatic aria-labelledby binding.
 * Styled as large semibold text for visual prominence.
 */
const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold", className)}
    {...props}
  />
))
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

/**
 * AlertDialog description component.
 * Uses Radix's Description primitive for automatic aria-describedby binding.
 * Styled with muted color and smaller text for secondary information.
 */
const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
AlertDialogDescription.displayName =
  AlertDialogPrimitive.Description.displayName

/**
 * AlertDialog action button component.
 * The primary confirmation button (e.g., "Delete", "Confirm", "Continue").
 * Uses the default buttonVariants style (primary color) to indicate
 * that this is the primary action path.
 */
const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(buttonVariants(), className)}
    {...props}
  />
))
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

/**
 * AlertDialog cancel button component.
 * The secondary dismissal button (e.g., "Cancel", "Go Back").
 * Uses the outline buttonVariant to visually de-emphasize compared
 * to the Action button. Adds top margin on mobile (mt-2) for spacing
 * in the reversed column layout, removed on sm+ (sm:mt-0) where
 * horizontal layout handles spacing via space-x-2.
 */
const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(
      buttonVariants({ variant: "outline" }),
      "mt-2 sm:mt-0",
      className
    )}
    {...props}
  />
))
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
