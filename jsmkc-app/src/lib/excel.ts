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

export function downloadCSV(headers: string[], data: (string | number)[][], filename: string) {
  // Add BOM for UTF-8 support in Excel
  const BOM = '\uFEFF';
  
  const rows = [
    headers.join(','),
    ...data.map(row => row.join(','))
  ];
  
  const csvContent = BOM + rows.join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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

export function getExportFormat(format: string | null): 'xlsx' | 'csv' {
  return (format === 'csv' ? 'csv' : 'xlsx');
}
