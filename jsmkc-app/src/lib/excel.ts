import * as XLSX from 'xlsx';

export interface ExcelSheet {
  name: string;
  data: (string | number)[][];
  headers: string[];
}

export function createWorkbook(sheets: ExcelSheet[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  sheets.forEach((sheet) => {
    const worksheetData = [
      sheet.headers,
      ...sheet.data,
    ];

    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    // Set column widths
    const colWidths = sheet.headers.map((header) => ({
      wch: Math.max(header.length, 15),
    }));
    ws['!cols'] = colWidths;

    // Freeze header row
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
  });

  return workbook;
}

export function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(workbook, filename);
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
