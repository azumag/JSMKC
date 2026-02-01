/**
 * CSV/Excel Export Utilities
 *
 * Provides functions for generating CSV files compatible with
 * Microsoft Excel, Google Sheets, and other spreadsheet applications.
 *
 * These utilities are used to export tournament data:
 * - Player standings and rankings
 * - Match results and scores
 * - Time trial records
 * - Tournament statistics
 *
 * CSV format is chosen over XLSX because:
 * - No external dependencies required
 * - Simpler to generate server-side
 * - Universally supported by spreadsheet applications
 * - Smaller file sizes for large datasets
 *
 * Excel compatibility notes:
 * - BOM (Byte Order Mark) is prepended for UTF-8 encoding detection
 * - Values containing commas, quotes, or newlines are properly escaped
 * - Dates are formatted in ISO format for cross-locale compatibility
 *
 * Usage:
 *   import { createCSV, formatTime } from '@/lib/excel';
 *   const csv = createCSV(
 *     ['Rank', 'Player', 'Time'],
 *     [[1, 'Player1', formatTime(83450)]]
 *   );
 *   return new Response(csv, {
 *     headers: { 'Content-Type': 'text/csv; charset=utf-8' }
 *   });
 */

// ============================================================
// CSV Escaping and Formatting
// ============================================================

/**
 * Escapes a value for safe inclusion in a CSV cell.
 *
 * CSV escaping rules (RFC 4180):
 * - If a value contains commas, double quotes, or newlines,
 *   it must be wrapped in double quotes
 * - Double quotes within a value are escaped by doubling them
 *   (e.g., 'He said "hello"' becomes '"He said ""hello"""')
 *
 * Handles null and undefined values by converting to empty string.
 * Numbers and booleans are converted to their string representation.
 *
 * @param value - The value to escape (any type)
 * @returns The escaped string safe for CSV inclusion
 *
 * @example
 *   escapeCSV('hello')          // 'hello'
 *   escapeCSV('has, comma')     // '"has, comma"'
 *   escapeCSV('has "quotes"')   // '"has ""quotes"""'
 *   escapeCSV(null)             // ''
 *   escapeCSV(42)               // '42'
 */
export function escapeCSV(value: unknown): string {
  // Handle null/undefined by returning empty string.
  // This prevents "null" or "undefined" from appearing in the CSV.
  if (value === null || value === undefined) {
    return '';
  }

  // Convert to string for uniform processing
  const str = String(value);

  // Check if the value needs quoting.
  // Values that contain commas, double quotes, or newlines must be
  // enclosed in double quotes per RFC 4180 specification.
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Escape internal double quotes by doubling them.
    // Then wrap the entire value in double quotes.
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Creates a CSV row from an array of values.
 *
 * Each value is escaped individually and joined with commas.
 * The row is terminated with a Windows-style newline (\r\n)
 * for maximum compatibility with spreadsheet applications.
 *
 * @param values - Array of values to include in the row
 * @returns A CSV-formatted row string with trailing newline
 *
 * @example
 *   csvRow([1, 'Player Name', '1:23.456'])
 *   // Returns: '1,Player Name,1:23.456\r\n'
 *
 *   csvRow(['Name, with comma', 42])
 *   // Returns: '"Name, with comma",42\r\n'
 */
export function csvRow(values: unknown[]): string {
  // Escape each value individually and join with commas.
  // Using \r\n (CRLF) line endings for Windows/Excel compatibility.
  // RFC 4180 specifies CRLF as the standard line ending for CSV.
  return values.map(escapeCSV).join(',') + '\r\n';
}

/**
 * Creates a complete CSV string from headers and data rows.
 *
 * Prepends a UTF-8 BOM (Byte Order Mark) so that Excel correctly
 * detects the file encoding. Without the BOM, Excel may interpret
 * UTF-8 files as Latin-1 or the system's default encoding, causing
 * garbled characters for non-ASCII text (e.g., Japanese player names).
 *
 * @param headers - Array of column header strings
 * @param rows - Array of row arrays, each containing cell values
 * @returns Complete CSV string with BOM, headers, and data rows
 *
 * @example
 *   const csv = createCSV(
 *     ['Rank', 'Name', 'Score'],
 *     [
 *       [1, 'Player1', 100],
 *       [2, 'Player2', 85],
 *     ]
 *   );
 *   // Returns: '\ufeffRank,Name,Score\r\n1,Player1,100\r\n2,Player2,85\r\n'
 */
export function createCSV(
  headers: string[],
  rows: unknown[][]
): string {
  // UTF-8 BOM: \uFEFF (U+FEFF, Zero Width No-Break Space)
  // This invisible character at the start of the file tells Excel
  // and other applications that the file is UTF-8 encoded.
  // Without it, Excel defaults to the system's encoding which may
  // not support Japanese characters used in JSMKC player names.
  const BOM = '\uFEFF';

  // Build the CSV: BOM + header row + data rows
  let csv = BOM;
  csv += csvRow(headers);
  for (const row of rows) {
    csv += csvRow(row);
  }

  return csv;
}

// ============================================================
// Data Formatting Helpers
// ============================================================

/**
 * Formats a time in milliseconds to the standard M:SS.mmm display format.
 *
 * This is the standard time display format for SMK
 * time trials and races. Times are displayed as minutes, seconds,
 * and milliseconds (e.g., "1:23.456").
 *
 * Handles edge cases:
 * - Null/undefined returns empty string
 * - Zero returns "0:00.000"
 * - Large times (>10 minutes) are formatted correctly
 *
 * @param ms - Time in milliseconds (null returns empty string)
 * @returns Formatted time string in M:SS.mmm format
 *
 * @example
 *   formatTime(83456)    // "1:23.456"
 *   formatTime(5000)     // "0:05.000"
 *   formatTime(null)     // ""
 *   formatTime(0)        // "0:00.000"
 *   formatTime(600123)   // "10:00.123"
 */
export function formatTime(ms: number | null | undefined): string {
  // Return empty string for null/undefined values.
  // This handles cases where no time has been recorded yet.
  if (ms === null || ms === undefined) {
    return '';
  }

  // Calculate minutes, seconds, and remaining milliseconds.
  // Math.floor ensures clean integer division without rounding issues.
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;

  // Format with zero-padding:
  // - Seconds: always 2 digits (01, 02, ..., 59)
  // - Milliseconds: always 3 digits (000, 001, ..., 999)
  // - Minutes: no padding (natural display)
  const paddedSeconds = String(seconds).padStart(2, '0');
  const paddedMilliseconds = String(milliseconds).padStart(3, '0');

  return `${minutes}:${paddedSeconds}.${paddedMilliseconds}`;
}

/**
 * Formats a Date object to ISO date string (YYYY-MM-DD).
 *
 * Uses the ISO format for cross-locale compatibility in spreadsheets.
 * Different locales format dates differently (MM/DD vs DD/MM),
 * but ISO format is unambiguous.
 *
 * @param date - The Date object to format (null returns empty string)
 * @returns ISO date string (YYYY-MM-DD) or empty string for null
 *
 * @example
 *   formatDate(new Date('2024-03-15T10:30:00Z'))  // "2024-03-15"
 *   formatDate(null)                                // ""
 */
export function formatDate(date: Date | null | undefined): string {
  // Handle null/undefined dates (e.g., tournaments without a set date)
  if (!date) {
    return '';
  }

  // toISOString returns "YYYY-MM-DDTHH:mm:ss.sssZ".
  // Split on 'T' to extract just the date portion.
  // This gives us the YYYY-MM-DD format that is internationally
  // unambiguous and sorts correctly as a string.
  return date.toISOString().split('T')[0];
}
