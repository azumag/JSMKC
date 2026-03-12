/**
 * Tabs UI Component
 *
 * A tabbed interface built on Radix UI's Tabs primitive for accessible
 * tab navigation. Used throughout the JSMKC app for:
 * - Tournament detail pages (switching between TA/BM/MR/GP modes)
 * - Score entry views (switching between different course groups)
 * - Settings panels (switching between configuration sections)
 *
 * Marked as "use client" because Radix Tabs manages active tab state
 * and requires browser APIs for keyboard navigation (arrow keys).
 *
 * Radix Tabs automatically handles:
 * - ARIA roles (tablist, tab, tabpanel)
 * - Keyboard navigation (Arrow Left/Right, Home, End)
 * - Focus management between trigger and content
 */
"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

/**
 * Tabs root component.
 * Manages active tab state and provides context to child components.
 * Uses flex-col layout with gap-2 to space the tab list and content.
 * Can be controlled (value + onValueChange) or uncontrolled (defaultValue).
 */
function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

/**
 * Tabs list component.
 * The container for tab triggers. Styled as a pill-shaped bar with
 * muted background. Uses inline-flex with w-fit to prevent the tab bar
 * from stretching to full width. The 3px padding creates visual inset
 * for the active tab indicator.
 */
function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        className
      )}
      {...props}
    />
  )
}

/**
 * Tabs trigger (tab button) component.
 * Individual tab buttons within the tab list. Features:
 * - Active state: elevated background with shadow to look "selected"
 * - Dark mode: uses input background for active state
 * - Focus-visible: ring indicator for keyboard navigation
 * - flex-1: distributes available width equally among triggers
 * - Transition on color and box-shadow for smooth state changes
 *
 * The transparent border on inactive state prevents layout shift when
 * the active state adds a visible border in dark mode.
 */
function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

/**
 * Tabs content panel component.
 * The content area displayed when a tab is active. Uses flex-1 to fill
 * remaining vertical space when Tabs root is in a flex container.
 * Outline-none removes the default focus outline since focus is managed
 * by the tab triggers themselves.
 */
function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
