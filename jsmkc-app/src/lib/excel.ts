export function escapeCSV(value: string | number | null | undefined): string {
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
  return values.map(v => escapeCSV(v as string | number | null)).join(',');
}

export function createCSV(headers: string[], rows: (string | number)[][]): string {
  const headerRow = csvRow(headers);
  const dataRows = rows.map(row => csvRow(row));
  return [headerRow, ...dataRows].join('\n');
}

export function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
