/**
 * Table UI Component
 *
 * A set of styled HTML table elements for displaying tabular data.
 * Marked as "use client" because table components may be used within
 * interactive client-side components that manage sorting, filtering, etc.
 *
 * The Table component wraps the native <table> in a scrollable container
 * to handle responsive overflow on narrow viewports. This is critical for
 * tournament score tables which can have many columns (20 courses in TA mode).
 *
 * Each sub-component uses data-slot attributes for parent-based CSS targeting
 * and follows the shadcn/ui compound component pattern.
 */
"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Table wrapper component.
 * Wraps the native <table> in a div with overflow-x-auto to enable
 * horizontal scrolling on small screens without breaking the page layout.
 * The table itself uses caption-bottom to position captions below the data.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

/**
 * Table header section (<thead>).
 * Adds a bottom border to all child rows to visually separate the
 * header from the body content using the `[&_tr]:border-b` selector.
 */
function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

/**
 * Table body section (<tbody>).
 * Removes the bottom border from the last row to prevent a double-border
 * at the bottom of the table when combined with any table footer border.
 */
function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

/**
 * Table footer section (<tfoot>).
 * Uses a muted background and top border to visually distinguish
 * footer rows (e.g., totals, averages) from body data rows.
 * The last row's bottom border is removed to prevent edge double-borders.
 */
function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * Table row component (<tr>).
 * Includes hover highlighting and a selected state driven by data-[state=selected]
 * for use with row selection patterns (e.g., checkbox-based multi-select).
 * The transition-colors ensures smooth visual feedback on hover.
 */
function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
        className
      )}
      {...props}
    />
  )
}

/**
 * Table header cell (<th>).
 * Uses whitespace-nowrap to prevent header text from wrapping, ensuring
 * consistent column widths. The checkbox-specific selectors handle alignment
 * when a checkbox is placed in the header for row selection.
 * Height is fixed at h-10 for consistent header row sizing.
 */
function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

/**
 * Table data cell (<td>).
 * Uses whitespace-nowrap to prevent cell content from wrapping by default,
 * which is suitable for score/time values in tournament tables.
 * Consumers can override with whitespace-normal when needed for longer text.
 */
function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

/**
 * Table caption component.
 * Positioned at the bottom of the table (via caption-bottom on parent table).
 * Styled with muted color and margin-top for visual separation from table data.
 * Used to describe the table content for accessibility and context.
 */
function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
