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
    it('should create a CSV row from array of strings', () => {
      const result = csvRow(['Name', 'Age', 'City']);
      expect(result).toBe('Name,Age,City');
    });

    it('should create a CSV row from array of numbers', () => {
      const result = csvRow([1, 2, 3]);
      expect(result).toBe('1,2,3');
    });

    it('should create a CSV row with mixed types', () => {
      const result = csvRow(['Name', 25, 'City']);
      expect(result).toBe('Name,25,City');
    });

    it('should escape values with commas in CSV row', () => {
      const result = csvRow(['Name', 'Last, First', 'City']);
      expect(result).toBe('Name,"Last, First",City');
    });

    it('should handle empty values', () => {
      const result = csvRow(['Name', '', 'City']);
      expect(result).toBe('Name,,City');
    });

    it('should handle null values', () => {
      const result = csvRow(['Name', null, 'City']);
      expect(result).toBe('Name,,City');
    });

    it('should handle undefined values', () => {
      const result = csvRow(['Name', undefined, 'City']);
      expect(result).toBe('Name,,City');
    });

    it('should create a CSV row with single value', () => {
      const result = csvRow(['Single']);
      expect(result).toBe('Single');
    });

    it('should create an empty CSV row', () => {
      const result = csvRow([]);
      expect(result).toBe('');
    });

    it('should handle values with quotes', () => {
      const result = csvRow(['Name', 'With "quotes"', 'City']);
      expect(result).toBe('Name,"With ""quotes""",City');
    });

    it('should handle multiple special characters in different values', () => {
      const result = csvRow(['Name,First', 'With "quotes"', 'Multi\nLine']);
      expect(result).toBe('"Name,First","With ""quotes""","Multi\nLine"');
    });
  });

  describe('createCSV', () => {
    it('should create a complete CSV with headers and rows', () => {
      const headers = ['Name', 'Age', 'City'];
      const rows = [['Alice', '25', 'NYC'], ['Bob', '30', 'LA']];
      const result = createCSV(headers, rows);
      
      expect(result).toBe('Name,Age,City\nAlice,25,NYC\nBob,30,LA');
    });

    it('should create CSV with headers only when no rows', () => {
      const headers = ['Name', 'Age'];
      const rows: (string | number)[][] = [];
      const result = createCSV(headers, rows);
      
      expect(result).toBe('Name,Age');
    });

    it('should handle empty headers and rows', () => {
      const headers: string[] = [];
      const rows: (string | number)[][] = [];
      const result = createCSV(headers, rows);
      
      expect(result).toBe('');
    });

    it('should escape special characters in headers', () => {
      const headers = ['Name, First', 'Last Name'];
      const rows = [['Alice', 'Smith']];
      const result = createCSV(headers, rows);
      
      expect(result).toBe('"Name, First",Last Name\nAlice,Smith');
    });

    it('should escape special characters in rows', () => {
      const headers = ['Name', 'Description'];
      const rows = [['Product', 'A "great" item'], ['Service', 'Fast, reliable']];
      const result = createCSV(headers, rows);
      
      expect(result).toBe('Name,Description\nProduct,"A ""great"" item"\nService,"Fast, reliable"');
    });

    it('should handle mixed data types in rows', () => {
      const headers = ['Name', 'Age', 'Score'];
      const rows = [['Alice', 25, 95.5], ['Bob', 30, 88]];
      const result = createCSV(headers, rows);
      
      expect(result).toBe('Name,Age,Score\nAlice,25,95.5\nBob,30,88');
    });

    it('should handle null and undefined in rows', () => {
      const headers = ['Name', 'Age', 'City'];
      const rows = [['Alice', null, 'NYC'], ['Bob', 30, undefined]];
      const result = createCSV(headers, rows);
      
      expect(result).toBe('Name,Age,City\nAlice,,NYC\nBob,30,');
    });

    it('should handle newlines in cell values', () => {
      const headers = ['Name', 'Description'];
      const rows = [['Item 1', 'Line 1\nLine 2']];
      const result = createCSV(headers, rows);
      
      expect(result).toBe('Name,Description\nItem 1,"Line 1\nLine 2"');
    });

    it('should create multiple rows correctly', () => {
      const headers = ['ID', 'Name'];
      const rows = [[1, 'Alice'], [2, 'Bob'], [3, 'Charlie']];
      const result = createCSV(headers, rows);
      
      const lines = result.split('\n');
      expect(lines).toHaveLength(4);
      expect(lines[0]).toBe('ID,Name');
      expect(lines[1]).toBe('1,Alice');
      expect(lines[2]).toBe('2,Bob');
      expect(lines[3]).toBe('3,Charlie');
    });

    it('should handle empty rows', () => {
      const headers = ['Name', 'Age'];
      const rows: (string | number)[][] = [['', '']];
      const result = createCSV(headers, rows);
      
      expect(result).toBe('Name,Age\n,');
    });
  });
});

describe('Time Formatting Utilities', () => {
  describe('formatTime', () => {
    it('should format milliseconds as MM:SS.CC format', () => {
      const result = formatTime(60000); // 1 minute
      expect(result).toBe('1:00.00');
    });

    it('should format zero time correctly', () => {
      const result = formatTime(0);
      expect(result).toBe('0:00.00');
    });

    it('should format seconds only correctly', () => {
      const result = formatTime(5000); // 5 seconds
      expect(result).toBe('0:05.00');
    });

    it('should format centiseconds correctly', () => {
      const result = formatTime(12345); // 12.345 seconds
      expect(result).toBe('0:12.34');
    });

    it('should handle centiseconds under 10ms', () => {
      const result = formatTime(1005); // 1.005 seconds
      expect(result).toBe('0:01.00');
    });

    it('should handle centiseconds exactly at 10ms intervals', () => {
      const result = formatTime(1010); // 1.01 seconds
      expect(result).toBe('0:01.01');
    });

    it('should format times with minutes and seconds', () => {
      const result = formatTime(125000); // 2 minutes 5 seconds
      expect(result).toBe('2:05.00');
    });

    it('should format times with minutes, seconds, and centiseconds', () => {
      const result = formatTime(125456); // 2 minutes 5 seconds 456ms
      expect(result).toBe('2:05.45');
    });

    it('should pad seconds with zeros when needed', () => {
      const result = formatTime(60001); // 1 minute 1 millisecond
      expect(result).toBe('1:00.00'); // 1ms rounds down to 0 centiseconds
    });

    it('should pad centiseconds with zeros when needed', () => {
      const result = formatTime(60000); // 1 minute exactly
      expect(result).toBe('1:00.00');
    });

    it('should handle large time values', () => {
      const result = formatTime(600000); // 10 minutes
      expect(result).toBe('10:00.00');
    });

    it('should handle time values with 99 centiseconds', () => {
      const result = formatTime(60990); // 1 minute 99 centiseconds
      expect(result).toBe('1:00.99');
    });

    it('should round down centiseconds', () => {
      const result = formatTime(60999); // 1 minute 999ms
      expect(result).toBe('1:00.99');
    });

    it('should handle 59 seconds', () => {
      const result = formatTime(59000); // 59 seconds
      expect(result).toBe('0:59.00');
    });

    it('should handle 59 seconds with 99 centiseconds', () => {
      const result = formatTime(59990); // 59 seconds 99 centiseconds
      expect(result).toBe('0:59.99');
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
