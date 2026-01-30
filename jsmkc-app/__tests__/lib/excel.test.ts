/**
 * @module __tests__/lib/excel.test.ts
 *
 * Test suite for the Excel/CSV export and formatting utilities (excel.ts).
 *
 * Covers the following functionality:
 * - escapeCSV(): Escapes values for CSV output. Handles null, undefined, empty
 *   strings, numbers, booleans, and strings containing commas, quotes, and
 *   newlines. Quotes are doubled per CSV RFC 4180 rules.
 * - csvRow(): Joins an array of values into a single CSV row string, applying
 *   escapeCSV to each value. Handles mixed types, null/undefined, and special
 *   characters. Returns row with CRLF (\r\n) line ending per RFC 4180.
 * - createCSV(): Builds a complete CSV document from header and row arrays.
 *   Prepends UTF-8 BOM (\uFEFF) for Excel compatibility and uses CRLF line
 *   endings. Handles empty data, special characters in headers and cells,
 *   mixed types, null/undefined values, and multi-line cell content.
 * - formatTime(): Converts milliseconds to "M:SS.mmm" display format (minutes,
 *   seconds, milliseconds with 3-digit padding). Tests zero, seconds-only,
 *   millisecond precision, boundary values (59s, 999ms), and large time values.
 * - formatDate(): Converts Date objects to "YYYY-MM-DD" ISO date strings.
 *   Tests various dates including leap years, year boundaries, dates with
 *   time/millisecond components, and timezone edge cases.
 */
// __tests__/lib/excel.test.ts
// Test for Excel and CSV export utilities
import { describe, it, expect } from '@jest/globals';
import {
  escapeCSV,
  csvRow,
  createCSV,
  formatTime,
  formatDate
} from '@/lib/excel';

describe('CSV Export Utilities', () => {
  describe('escapeCSV', () => {
    it('should return empty string for null', () => {
      const result = escapeCSV(null);
      expect(result).toBe('');
    });

    it('should return empty string for undefined', () => {
      const result = escapeCSV(undefined);
      expect(result).toBe('');
    });

    it('should return string as-is for simple text', () => {
      const result = escapeCSV('Hello World');
      expect(result).toBe('Hello World');
    });

    it('should convert number to string', () => {
      const result = escapeCSV(123);
      expect(result).toBe('123');
    });

    it('should escape strings containing commas', () => {
      const result = escapeCSV('Hello, World');
      expect(result).toBe('"Hello, World"');
    });

    it('should escape strings containing quotes', () => {
      const result = escapeCSV('He said "hello"');
      expect(result).toBe('"He said ""hello"""');
    });

    it('should escape strings containing newlines', () => {
      const result = escapeCSV('Line1\nLine2');
      expect(result).toBe('"Line1\nLine2"');
    });

    it('should escape strings with multiple special characters', () => {
      const result = escapeCSV('Hello, "World"\nNew line');
      expect(result).toBe('"Hello, ""World""\nNew line"');
    });

    it('should handle empty string', () => {
      const result = escapeCSV('');
      expect(result).toBe('');
    });

    it('should handle string with only comma', () => {
      const result = escapeCSV(',');
      expect(result).toBe('","');
    });

    it('should handle string with only quotes', () => {
      const result = escapeCSV('"');
      expect(result).toBe('""""');
    });

    it('should convert boolean values to string', () => {
      const result1 = escapeCSV(true);
      const result2 = escapeCSV(false);
      expect(result1).toBe('true');
      expect(result2).toBe('false');
    });

    it('should handle zero as a number', () => {
      const result = escapeCSV(0);
      expect(result).toBe('0');
    });

    it('should handle negative numbers', () => {
      const result = escapeCSV(-123);
      expect(result).toBe('-123');
    });

    it('should handle decimal numbers', () => {
      const result = escapeCSV(12.34);
      expect(result).toBe('12.34');
    });
  });

  describe('csvRow', () => {
    // csvRow appends CRLF (\r\n) to each row per RFC 4180 specification
    it('should create a CSV row from array of strings', () => {
      const result = csvRow(['Name', 'Age', 'City']);
      expect(result).toBe('Name,Age,City\r\n');
    });

    it('should create a CSV row from array of numbers', () => {
      const result = csvRow([1, 2, 3]);
      expect(result).toBe('1,2,3\r\n');
    });

    it('should create a CSV row with mixed types', () => {
      const result = csvRow(['Name', 25, 'City']);
      expect(result).toBe('Name,25,City\r\n');
    });

    it('should escape values with commas in CSV row', () => {
      const result = csvRow(['Name', 'Last, First', 'City']);
      expect(result).toBe('Name,"Last, First",City\r\n');
    });

    it('should handle empty values', () => {
      const result = csvRow(['Name', '', 'City']);
      expect(result).toBe('Name,,City\r\n');
    });

    it('should handle null values', () => {
      const result = csvRow(['Name', null, 'City']);
      expect(result).toBe('Name,,City\r\n');
    });

    it('should handle undefined values', () => {
      const result = csvRow(['Name', undefined, 'City']);
      expect(result).toBe('Name,,City\r\n');
    });

    it('should create a CSV row with single value', () => {
      const result = csvRow(['Single']);
      expect(result).toBe('Single\r\n');
    });

    it('should create an empty CSV row', () => {
      // Even an empty array produces a CRLF line ending
      const result = csvRow([]);
      expect(result).toBe('\r\n');
    });

    it('should handle values with quotes', () => {
      const result = csvRow(['Name', 'With "quotes"', 'City']);
      expect(result).toBe('Name,"With ""quotes""",City\r\n');
    });

    it('should handle multiple special characters in different values', () => {
      const result = csvRow(['Name,First', 'With "quotes"', 'Multi\nLine']);
      expect(result).toBe('"Name,First","With ""quotes""","Multi\nLine"\r\n');
    });
  });

  describe('createCSV', () => {
    // createCSV prepends UTF-8 BOM (\uFEFF) for Excel encoding detection
    // and uses CRLF (\r\n) line endings per RFC 4180 specification
    it('should create a complete CSV with headers and rows', () => {
      const headers = ['Name', 'Age', 'City'];
      const rows = [['Alice', '25', 'NYC'], ['Bob', '30', 'LA']];
      const result = createCSV(headers, rows);

      expect(result).toBe('\uFEFFName,Age,City\r\nAlice,25,NYC\r\nBob,30,LA\r\n');
    });

    it('should create CSV with headers only when no rows', () => {
      const headers = ['Name', 'Age'];
      const rows: (string | number)[][] = [];
      const result = createCSV(headers, rows);

      expect(result).toBe('\uFEFFName,Age\r\n');
    });

    it('should handle empty headers and rows', () => {
      const headers: string[] = [];
      const rows: (string | number)[][] = [];
      const result = createCSV(headers, rows);

      // BOM + empty row (just CRLF from the empty headers array)
      expect(result).toBe('\uFEFF\r\n');
    });

    it('should escape special characters in headers', () => {
      const headers = ['Name, First', 'Last Name'];
      const rows = [['Alice', 'Smith']];
      const result = createCSV(headers, rows);

      expect(result).toBe('\uFEFF"Name, First",Last Name\r\nAlice,Smith\r\n');
    });

    it('should escape special characters in rows', () => {
      const headers = ['Name', 'Description'];
      const rows = [['Product', 'A "great" item'], ['Service', 'Fast, reliable']];
      const result = createCSV(headers, rows);

      expect(result).toBe('\uFEFFName,Description\r\nProduct,"A ""great"" item"\r\nService,"Fast, reliable"\r\n');
    });

    it('should handle mixed data types in rows', () => {
      const headers = ['Name', 'Age', 'Score'];
      const rows = [['Alice', 25, 95.5], ['Bob', 30, 88]];
      const result = createCSV(headers, rows);

      expect(result).toBe('\uFEFFName,Age,Score\r\nAlice,25,95.5\r\nBob,30,88\r\n');
    });

    it('should handle null and undefined in rows', () => {
      const headers = ['Name', 'Age', 'City'];
      const rows = [['Alice', null, 'NYC'], ['Bob', 30, undefined]];
      const result = createCSV(headers, rows);

      expect(result).toBe('\uFEFFName,Age,City\r\nAlice,,NYC\r\nBob,30,\r\n');
    });

    it('should handle newlines in cell values', () => {
      const headers = ['Name', 'Description'];
      const rows = [['Item 1', 'Line 1\nLine 2']];
      const result = createCSV(headers, rows);

      expect(result).toBe('\uFEFFName,Description\r\nItem 1,"Line 1\nLine 2"\r\n');
    });

    it('should create multiple rows correctly', () => {
      const headers = ['ID', 'Name'];
      const rows = [[1, 'Alice'], [2, 'Bob'], [3, 'Charlie']];
      const result = createCSV(headers, rows);

      // Split on CRLF to check individual rows.
      // The result has BOM at the start and trailing CRLF, so last split element is empty.
      const lines = result.split('\r\n');
      expect(lines).toHaveLength(5); // 1 header + 3 data rows + 1 trailing empty string from final CRLF
      expect(lines[0]).toBe('\uFEFFID,Name');
      expect(lines[1]).toBe('1,Alice');
      expect(lines[2]).toBe('2,Bob');
      expect(lines[3]).toBe('3,Charlie');
      expect(lines[4]).toBe(''); // trailing empty string after final CRLF
    });

    it('should handle empty rows', () => {
      const headers = ['Name', 'Age'];
      const rows: (string | number)[][] = [['', '']];
      const result = createCSV(headers, rows);

      expect(result).toBe('\uFEFFName,Age\r\n,\r\n');
    });
  });
});

describe('Time Formatting Utilities', () => {
  describe('formatTime', () => {
    // formatTime outputs M:SS.mmm format (3-digit milliseconds, zero-padded)
    it('should format milliseconds as M:SS.mmm format', () => {
      const result = formatTime(60000); // 1 minute
      expect(result).toBe('1:00.000');
    });

    it('should format zero time correctly', () => {
      const result = formatTime(0);
      expect(result).toBe('0:00.000');
    });

    it('should format seconds only correctly', () => {
      const result = formatTime(5000); // 5 seconds
      expect(result).toBe('0:05.000');
    });

    it('should format milliseconds correctly', () => {
      const result = formatTime(12345); // 12.345 seconds
      expect(result).toBe('0:12.345');
    });

    it('should handle milliseconds under 10ms', () => {
      const result = formatTime(1005); // 1.005 seconds => 5ms remainder
      expect(result).toBe('0:01.005');
    });

    it('should handle milliseconds exactly at 10ms intervals', () => {
      const result = formatTime(1010); // 1.010 seconds => 10ms remainder
      expect(result).toBe('0:01.010');
    });

    it('should format times with minutes and seconds', () => {
      const result = formatTime(125000); // 2 minutes 5 seconds
      expect(result).toBe('2:05.000');
    });

    it('should format times with minutes, seconds, and milliseconds', () => {
      const result = formatTime(125456); // 2 minutes 5 seconds 456ms
      expect(result).toBe('2:05.456');
    });

    it('should pad seconds with zeros when needed', () => {
      const result = formatTime(60001); // 1 minute 1 millisecond
      expect(result).toBe('1:00.001');
    });

    it('should pad milliseconds with zeros when needed', () => {
      const result = formatTime(60000); // 1 minute exactly
      expect(result).toBe('1:00.000');
    });

    it('should handle large time values', () => {
      const result = formatTime(600000); // 10 minutes
      expect(result).toBe('10:00.000');
    });

    it('should handle time values with 990 milliseconds', () => {
      const result = formatTime(60990); // 1 minute 0 seconds 990ms
      expect(result).toBe('1:00.990');
    });

    it('should preserve full millisecond precision', () => {
      const result = formatTime(60999); // 1 minute 0 seconds 999ms
      expect(result).toBe('1:00.999');
    });

    it('should handle 59 seconds', () => {
      const result = formatTime(59000); // 59 seconds
      expect(result).toBe('0:59.000');
    });

    it('should handle 59 seconds with 990 milliseconds', () => {
      const result = formatTime(59990); // 59 seconds 990ms
      expect(result).toBe('0:59.990');
    });
  });
});

describe('Date Formatting Utilities', () => {
  describe('formatDate', () => {
    it('should format date as ISO date string (YYYY-MM-DD)', () => {
      const date = new Date('2024-01-15T00:00:00.000Z');
      const result = formatDate(date);
      expect(result).toBe('2024-01-15');
    });

    it('should handle date with time component', () => {
      const date = new Date('2024-06-20T14:30:45.000Z');
      const result = formatDate(date);
      expect(result).toBe('2024-06-20');
    });

    it('should handle date in different timezone (returns local date)', () => {
      const date = new Date('2024-12-31T23:59:59.000Z');
      const result = formatDate(date);
      // The exact result depends on timezone, but should be in YYYY-MM-DD format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should handle leap year date', () => {
      const date = new Date('2024-02-29T00:00:00.000Z');
      const result = formatDate(date);
      expect(result).toBe('2024-02-29');
    });

    it('should handle first day of year', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      const result = formatDate(date);
      expect(result).toBe('2024-01-01');
    });

    it('should handle last day of year', () => {
      const date = new Date('2024-12-31T00:00:00.000Z');
      const result = formatDate(date);
      expect(result).toBe('2024-12-31');
    });

    it('should handle date with milliseconds', () => {
      const date = new Date('2024-03-15T12:30:45.123Z');
      const result = formatDate(date);
      expect(result).toBe('2024-03-15');
    });

    it('should consistently format the same date', () => {
      const date = new Date('2024-08-25T00:00:00.000Z');
      const result1 = formatDate(date);
      const result2 = formatDate(date);
      expect(result1).toBe(result2);
    });

    it('should return valid date format for current date', () => {
      const result = formatDate(new Date());
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
