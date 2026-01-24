// Create mock functions for excel module
export function escapeCSV(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function csvRow<T>(values: T[]): string {
  return values.map(v => escapeCSV(v as string | number | boolean | null)).join(',');
}

export const createCSV = jest.fn();

export const formatTime = jest.fn();

export const formatDate = jest.fn();
