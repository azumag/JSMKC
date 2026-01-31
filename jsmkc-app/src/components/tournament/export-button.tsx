/**
 * ExportButton Component
 *
 * Provides a one-click export action for tournament data. The component
 * fetches an Excel (.xlsx) file from the server API and triggers a
 * browser download using a dynamically created anchor element.
 *
 * Supports exporting either the full tournament or individual competition
 * modes (TA, BM, MR, GP). The API endpoint is constructed based on the
 * selected mode, following the pattern:
 *   - Full export: /api/tournaments/{id}/export
 *   - Mode export: /api/tournaments/{id}/{mode}/export
 *
 * The filename is extracted from the Content-Disposition response header
 * when available, falling back to a generated name based on the tournament
 * name and export mode.
 *
 * Export:
 *   - ExportButton: Named export (the primary component).
 */

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { createLogger } from "@/lib/client-logger";

/**
 * Module-level logger for export operations.
 * Uses client-logger which suppresses output in test environments.
 */
const logger = createLogger({ serviceName: 'export-button' });

/**
 * Props for the ExportButton component.
 *
 * @property tournamentId - The unique identifier of the tournament to export.
 * @property tournamentName - Human-readable tournament name, used for the
 *   fallback filename. Defaults to "tournament" if not provided.
 * @property mode - Which data to export: "full" for all modes combined,
 *   or a specific mode ("bm", "mr", "gp", "ta"). Defaults to "full".
 * @property children - Optional custom button label. If not provided,
 *   the label is auto-generated (e.g., "Export All" or "Export TA").
 * @property variant - Button visual variant, passed through to the
 *   underlying Button component. Defaults to "outline".
 * @property size - Button size variant. Defaults to "sm".
 * @property disabled - Whether the button should be disabled. Defaults to false.
 */
interface ExportButtonProps {
  tournamentId: string;
  tournamentName?: string;
  mode?: "full" | "bm" | "mr" | "gp" | "ta";
  children?: React.ReactNode;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  size?: "default" | "sm" | "lg";
  disabled?: boolean;
}

/**
 * ExportButton - Triggers a file download of tournament data.
 *
 * The export flow:
 *   1. Fetch the export endpoint as a blob (binary data).
 *   2. Create a temporary object URL from the blob.
 *   3. Create an invisible anchor element with the download attribute.
 *   4. Programmatically click the anchor to trigger the browser download dialog.
 *   5. Clean up the object URL and temporary anchor element.
 *
 * This approach is necessary because:
 *   - Direct navigation (window.location) would lose the current page state.
 *   - The download attribute on the anchor ensures the browser saves the
 *     file rather than attempting to display it inline.
 */
export function ExportButton({
  tournamentId,
  tournamentName = "tournament",
  mode = "full",
  children,
  variant = "outline",
  size = "sm",
  disabled = false
}: ExportButtonProps) {

  /**
   * Handles the export action: fetches the file, extracts the filename,
   * and triggers a browser download.
   */
  const handleExport = async () => {
    try {
      /**
       * Build the API endpoint based on the export mode.
       * Full exports use a single endpoint; mode-specific exports
       * include the mode segment in the URL path.
       */
      const endpoint = mode === "full"
        ? `/api/tournaments/${tournamentId}/export`
        : `/api/tournaments/${tournamentId}/${mode}/export`;

      const response = await fetch(endpoint);

      if (!response.ok) {
        throw new Error("Failed to export tournament");
      }

      /** Convert the response to a binary blob for download */
      const blob = await response.blob();

      /** Create a temporary object URL pointing to the in-memory blob */
      const url = window.URL.createObjectURL(blob);

      /** Create a temporary invisible anchor element to trigger the download */
      const link = document.createElement("a");
      link.href = url;

      /**
       * Attempt to extract the filename from the Content-Disposition header.
       * The server may provide a descriptive filename in the format:
       *   Content-Disposition: attachment; filename="tournament-export.xlsx"
       *
       * If the header is absent or unparseable, generate a fallback filename
       * by sanitizing the tournament name (replacing non-alphanumeric chars
       * with underscores) and appending the mode and .xlsx extension.
       */
      const contentDisposition = response.headers.get("content-disposition");
      let filename = `${tournamentName.replace(/[^a-zA-Z0-9]/g, "_")}-${mode}-export.xlsx`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      /**
       * Set the download attribute to suggest the filename to the browser,
       * append the anchor to the DOM, click it programmatically, then clean up.
       * The anchor must be in the DOM for the click to work in all browsers.
       */
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      /** Revoke the object URL to free the memory held by the blob */
      window.URL.revokeObjectURL(url);
    } catch (error) {
      /**
       * Log export failures with structured metadata for debugging.
       * The error is logged but not re-thrown; the user sees no feedback
       * beyond the console log. A toast notification could be added here
       * for better UX in a future iteration.
       */
      const metadata = error instanceof Error ? { message: error.message, stack: error.stack } : { error };
      logger.error("Export failed", metadata);
    }
  };

  return (
    <Button
      onClick={handleExport}
      variant={variant}
      size={size}
      disabled={disabled}
    >
      <Download className="w-4 h-4 mr-2" />
      {/* Display custom children label, or generate one from the mode */}
      {children || `Export ${mode === "full" ? "All" : mode.toUpperCase()}`}
    </Button>
  );
}
