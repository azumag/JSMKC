/**
 * Dialog UI Component
 *
 * A modal dialog built on Radix UI's Dialog primitive for accessible
 * modal interactions. Used throughout the JSMKC app for:
 * - Score entry confirmation dialogs
 * - Tournament settings editing
 * - Player registration forms
 *
 * Marked as "use client" because Radix Dialog manages internal state
 * (open/closed) and requires browser APIs for portal rendering and
 * focus management.
 *
 * The compound component pattern exposes granular control over each
 * part of the dialog (trigger, overlay, content, header, footer, etc.)
 * while maintaining consistent styling and accessibility behavior.
 */
"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Dialog root component.
 * Manages open/closed state and provides context to child components.
 * Can be controlled (open + onOpenChange props) or uncontrolled.
 */
function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

/**
 * Dialog trigger component.
 * The element that opens the dialog when clicked.
 * Radix automatically handles aria-haspopup and aria-expanded attributes.
 */
function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

/**
 * Dialog portal component.
 * Renders dialog content into a React portal (document.body by default)
 * to avoid z-index and overflow issues from parent containers.
 */
function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

/**
 * Dialog close component.
 * A button that closes the dialog when clicked.
 * Can be placed anywhere inside the dialog content.
 */
function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/**
 * Dialog overlay component.
 * The semi-transparent backdrop behind the dialog content.
 * Uses animate-in/animate-out for smooth fade transitions on open/close.
 * Fixed positioning with inset-0 covers the entire viewport.
 * z-50 ensures it renders above all other content.
 */
function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

/**
 * Dialog content component.
 * The main container for dialog body content. Features:
 * - Centered positioning using translate(-50%, -50%) on fixed element
 * - Responsive max-width: full width minus 2rem margin on mobile, sm:max-w-lg on desktop
 * - Entry/exit animations: fade + zoom for polished UX
 * - Optional close button (X icon) in top-right corner
 *
 * @param showCloseButton - Controls visibility of the X close button (default: true).
 *   Set to false for dialogs that must be explicitly confirmed/cancelled
 *   (e.g., destructive action confirmations that should not be dismissed casually).
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 outline-none sm:max-w-lg",
          className
        )}
        {...props}
      >
        {children}
        {/* Conditionally render the close button (X icon) in the top-right corner.
            The sr-only span provides screen reader text for accessibility. */}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

/**
 * Dialog header layout component.
 * Provides consistent vertical spacing and text alignment for the
 * dialog title and description. Centered on mobile, left-aligned on sm+.
 */
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

/**
 * Dialog footer layout component.
 * Arranges action buttons in a column on mobile (reversed order so
 * primary action appears first visually) and a row on sm+ screens.
 * The reverse order on mobile puts the primary action at the bottom,
 * which is the natural thumb reach area on mobile devices.
 */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

/**
 * Dialog title component.
 * Uses Radix's Title primitive which automatically sets aria-labelledby
 * on the dialog content for screen reader accessibility.
 */
function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

/**
 * Dialog description component.
 * Uses Radix's Description primitive which automatically sets
 * aria-describedby on the dialog content for screen reader accessibility.
 * Styled with muted color and smaller text for visual hierarchy.
 */
function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
