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
        // paddock-overlay supplies the blur + scanline texture; the
        // animate-in/out classes layer Tailwind's tw-animate-css fade on top.
        "paddock-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50",
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
          // `paddock-modal` paints the checker top stripe, the red side bar,
          // the diagonal race-stripe wash, and the layered drop shadow.
          // pt-9 leaves room under the 6px top stripe so the title doesn't
          // crowd the checker band.
          "paddock-modal paddock-drop fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-5 px-6 pt-9 pb-6 outline-none sm:max-w-lg",
          // Closing animation falls back to fade+zoom; the open animation is
          // driven by the paddock-drop keyframes for the panel-landing motion.
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150",
          className
        )}
        {...props}
      >
        {children}
        {/* Pit-board exit button — bordered 28px square keeps the racing
            signage feel rather than a floating ghost icon. The accent ring
            on hover echoes the Racing Red side bar. */}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            // Visual is a 28px square pit-board button, but `before:-inset-2`
            // adds an 8px transparent halo so the actual touch target is 44px
            // -- meets WCAG 2.5.5 / Apple HIG without expanding the visible
            // chrome over the modal header.
            className="ring-offset-background focus:ring-ring absolute top-3 right-3 inline-flex size-7 items-center justify-center rounded-xs border border-foreground/25 bg-card/70 text-foreground/70 transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none before:absolute before:-inset-2 before:content-[''] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5"
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
      className={cn(
        // The header sits below the 6px top stripe; a thin checker hairline
        // under the title block reinforces the briefing-slip feel without
        // adding another DOM node.
        "flex flex-col gap-1.5 pb-3 text-center sm:text-left border-b border-dashed border-foreground/15",
        className
      )}
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
      // Display type (Anton, uppercase) elevates the title to FIA-bulletin
      // level without making the rest of the app heavy. Tracking is opened
      // up slightly for legibility at this size.
      className={cn(
        "font-display text-2xl leading-[0.95] tracking-[0.04em] text-foreground",
        className
      )}
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
      // Mono caption sits under the Anton headline like race-graphic metadata.
      // No uppercase / wide tracking here -- JetBrains Mono lacks JP glyphs so
      // descriptions in Japanese fall back to system mono; uppercase is a
      // no-op on JP and 0.08em tracking visibly breaks JP kerning, so we
      // keep the styling readable in both languages.
      className={cn(
        "font-mono text-xs text-muted-foreground",
        className
      )}
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
