/**
 * Select UI Component
 *
 * A feature-rich dropdown select built on Radix UI's Select primitive.
 * Provides accessible, keyboard-navigable dropdown menus with custom styling.
 *
 * Marked as "use client" because Radix Select manages internal state
 * (open/closed, selected value) and requires browser APIs for positioning
 * the dropdown relative to the trigger element.
 *
 * Used throughout the JSMKC app for:
 * - Tournament mode selection (TA/BM/MR/GP)
 * - Course selection in score entry
 * - Player filtering and sorting options
 *
 * The compound component pattern provides granular control:
 * - Select: Root state manager
 * - SelectTrigger: The button that opens the dropdown
 * - SelectContent: The dropdown panel (rendered in a portal)
 * - SelectItem: Individual selectable options
 * - SelectGroup/SelectLabel: Grouped options with headings
 * - SelectSeparator: Visual divider between groups
 * - SelectScrollUpButton/SelectScrollDownButton: Scroll indicators
 */
"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Select root component.
 * Manages the selected value and open/closed state.
 * Passes through the disabled prop for form integration.
 */
function Select({
  disabled,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return (
    <SelectPrimitive.Root disabled={disabled} data-slot="select" {...props} />
  )
}

/**
 * Select group component.
 * Groups related items together for logical organization.
 * Used with SelectLabel to provide a heading for the group.
 */
function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

/**
 * Select value display component.
 * Shows the currently selected value text inside the trigger.
 * Supports a placeholder prop for empty state display.
 */
function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

/**
 * Select trigger button component.
 * The interactive element that opens the dropdown when clicked.
 *
 * @param size - Controls the trigger height: "default" (36px) or "sm" (32px)
 *
 * Features:
 * - Chevron down icon appended automatically via SelectPrimitive.Icon
 * - Focus ring and aria-invalid styling for form integration
 * - w-fit width to size to content rather than full width
 * - line-clamp-1 on the value display prevents overflow on long text
 * - Dark mode: slightly tinted background with hover emphasis
 */
function SelectTrigger({
  className,
  size = "default",
  disabled,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      disabled={disabled}
      className={cn(
        "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      {/* Chevron icon indicating dropdown functionality.
          Rendered with reduced opacity to not compete with the value text. */}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

/**
 * Select dropdown content component.
 * The floating panel that contains the selectable options.
 * Rendered via a React portal to escape parent overflow constraints.
 *
 * @param position - Positioning strategy: "item-aligned" (default) aligns the
 *   selected item with the trigger; "popper" uses floating-ui positioning.
 *   Item-aligned is preferred for single-select as it provides visual continuity.
 * @param align - Alignment relative to trigger when using popper position.
 *
 * Animation: fade + zoom on open/close, with directional slide-in based on
 * which side of the trigger the dropdown appears (top/bottom/left/right).
 *
 * The max-height is automatically constrained by Radix to the available
 * viewport space via --radix-select-content-available-height CSS variable.
 */
function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        align={align}
        {...props}
      >
        {/* Viewport wrapper constrains the scrollable area.
            When using popper position, the viewport dimensions are tied to the
            trigger dimensions via CSS variables for consistent sizing. */}
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

/**
 * Select group label component.
 * Displays a non-interactive heading for a group of options.
 * Uses smaller text and muted color to differentiate from selectable items.
 */
function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
      {...props}
    />
  )
}

/**
 * Select item component.
 * An individual selectable option within the dropdown.
 *
 * Features:
 * - Check icon indicator for the currently selected item (positioned absolutely on the right)
 * - Focus highlight for keyboard navigation
 * - Disabled state with reduced opacity and no pointer events
 * - SVG icon support within items for visual context
 *
 * The pr-8 padding reserves space for the check indicator on the right,
 * and pl-2 provides consistent left alignment for all items.
 */
function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      {/* Check icon indicator positioned absolutely on the right side.
          Only visible when this item is the currently selected value. */}
      <span
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

/**
 * Select separator component.
 * A horizontal line divider between groups or items.
 * Uses negative horizontal margin to extend to the dropdown edges.
 */
function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  )
}

/**
 * Select scroll-up button component.
 * Appears at the top of the dropdown when items overflow above the visible area.
 * Provides a visual indicator and clickable area to scroll up through options.
 */
function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

/**
 * Select scroll-down button component.
 * Appears at the bottom of the dropdown when items overflow below the visible area.
 * Provides a visual indicator and clickable area to scroll down through options.
 */
function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
