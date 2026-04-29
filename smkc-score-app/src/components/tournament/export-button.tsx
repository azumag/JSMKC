/**
 * ExportButton Component
 *
 * Provides a one-click export action for tournament data. The component
 * fetches the full tournament CSV from the server API and triggers a browser
 * download using a dynamically created anchor element.
 *
 * The full tournament export is the single source of truth: per-mode CSV
 * exports were consolidated into this unified export so operators do not
 * have to collect multiple files per tournament (see issue #418).
 *
 * Export:
 *   - ExportButton: Named export (the primary component).
 */

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { createLogger } from "@/lib/client-logger";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * Module-level logger for export operations.
 * Uses client-logger which suppresses output in test environments.
 */
const logger = createLogger({ serviceName: 'export-button' });

class ExportRequestError extends Error {
  readonly status: number;

  constructor(status: number, detail?: string) {
    const suffix = detail ? `: ${detail}` : '';
    super(`HTTP ${status}${suffix}`);
    this.name = 'ExportRequestError';
    this.status = status;
  }
}

function buildExportErrorMessage(
  error: unknown,
  t: ReturnType<typeof useTranslations>,
): string {
  const baseMessage = t("exportFailed");

  if (error instanceof ExportRequestError) {
    const statusMessage = error.status === 401 || error.status === 403
      ? t("exportFailedForbidden")
      : t("exportFailedHttpStatus", { status: error.status });
    return `${baseMessage}: ${statusMessage}`;
  }

  if (error instanceof TypeError) {
    return `${baseMessage}: ${t("exportFailedNetwork")}`;
  }

  if (error instanceof Error && error.message) {
    return `${baseMessage}: ${error.message}`;
  }

  return baseMessage;
}

/**
 * Props for the ExportButton component.
 *
 * @property tournamentId - The unique identifier of the tournament to export.
 * @property tournamentName - Human-readable tournament name, used for the
 *   fallback filename. Defaults to "tournament" if not provided.
 * @property children - Optional custom button label. If not provided,
 *   the translated "export all" label is used.
 * @property variant - Button visual variant, passed through to the
 *   underlying Button component. Defaults to "outline".
 * @property size - Button size variant. Defaults to "sm".
 * @property disabled - Whether the button should be disabled. Defaults to false.
 */
interface ExportButtonProps {
  tournamentId: string;
  tournamentName?: string;
  format?: "csv" | "cdm";
  children?: React.ReactNode;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  size?: "default" | "sm" | "lg";
  disabled?: boolean;
}

/**
 * ExportButton - Triggers a file download of the full tournament data.
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
  format = "csv",
  children,
  variant = "outline",
  size = "sm",
  disabled = false
}: ExportButtonProps) {
  const t = useTranslations("common");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Handles the export action: fetches the file, extracts the filename,
   * and triggers a browser download.
   */
  const handleExport = async () => {
    try {
      setErrorMessage(null);
      const query = format === "cdm" ? "?format=cdm" : "";
      const response = await fetch(`/api/tournaments/${tournamentId}/export${query}`);

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new ExportRequestError(response.status, detail.trim().slice(0, 160));
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
       * If absent, fall back to a sanitized tournament-name based filename.
       */
      const contentDisposition = response.headers.get("content-disposition");
      const extension = format === "cdm" ? "xlsm" : "csv";
      let filename = `${tournamentName.replace(/[^a-zA-Z0-9]/g, "_")}-full-export.${extension}`;

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
       */
      const metadata = error instanceof Error ? { message: error.message, stack: error.stack } : { error };
      logger.error("Export failed", metadata);
      setErrorMessage(buildExportErrorMessage(error, t));
    }
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        onClick={handleExport}
        variant={variant}
        size={size}
        disabled={disabled}
      >
        <Download className="w-4 h-4 mr-2" />
        {children || t("exportAll")}
      </Button>
      {errorMessage ? (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
