/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportButton } from '@/components/tournament/export-button';

jest.mock('@/lib/client-logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe('ExportButton', () => {
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;
  const originalFetch = global.fetch;
  const mockLogger = (jest.requireMock('@/lib/client-logger').createLogger as jest.Mock).mock.results[0].value;

  beforeEach(() => {
    window.URL.createObjectURL = jest.fn(() => 'blob:cdm-export');
    window.URL.revokeObjectURL = jest.fn();
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fetches the CDM export URL and downloads an XLSM filename from the response header', async () => {
    const workbook = new Blob(['PK\x03\x04 workbook'], {
      type: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    });
    global.fetch = jest.fn().mockResolvedValue(new Response(workbook, {
      status: 200,
      headers: {
        'content-disposition': 'attachment; filename="Grand_Prix-cdm-2026-04-29.xlsm"',
      },
    }));
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation();
    const originalCreateElement = document.createElement.bind(document);
    const anchors: HTMLAnchorElement[] = [];
    jest.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'a') anchors.push(element as HTMLAnchorElement);
      return element;
    }) as typeof document.createElement);

    render(
      <ExportButton tournamentId="tournament-1" tournamentName="Grand Prix" format="cdm">
        CDM Export
      </ExportButton>,
    );

    fireEvent.click(screen.getByRole('button', { name: /CDM Export/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/tournaments/tournament-1/export?format=cdm');
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    expect(anchors[0]).toMatchObject({
      href: 'blob:cdm-export',
      download: 'Grand_Prix-cdm-2026-04-29.xlsm',
    });
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:cdm-export');
  });

  it('logs and skips download when the export response is not OK', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation();

    render(
      <ExportButton tournamentId="tournament-1" tournamentName="Grand Prix" format="cdm">
        CDM Export
      </ExportButton>,
    );

    fireEvent.click(screen.getByRole('button', { name: /CDM Export/i }));

    await waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalledWith('Export failed', expect.objectContaining({
        message: 'Failed to export tournament',
      }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to export tournament');
    expect(clickSpy).not.toHaveBeenCalled();
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('logs and skips download when fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation();

    render(
      <ExportButton tournamentId="tournament-1" tournamentName="Grand Prix" format="cdm">
        CDM Export
      </ExportButton>,
    );

    fireEvent.click(screen.getByRole('button', { name: /CDM Export/i }));

    await waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalledWith('Export failed', expect.objectContaining({
        message: 'network down',
      }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('network down');
    expect(clickSpy).not.toHaveBeenCalled();
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('uses a sanitized fallback XLSM filename when Content-Disposition is missing', async () => {
    const workbook = new Blob(['PK\x03\x04 workbook'], {
      type: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    });
    global.fetch = jest.fn().mockResolvedValue(new Response(workbook, { status: 200 }));
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation();
    const originalCreateElement = document.createElement.bind(document);
    const anchors: HTMLAnchorElement[] = [];
    jest.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'a') anchors.push(element as HTMLAnchorElement);
      return element;
    }) as typeof document.createElement);

    render(
      <ExportButton tournamentId="tournament-1" tournamentName="Grand Prix 2026!" format="cdm">
        CDM Export
      </ExportButton>,
    );

    fireEvent.click(screen.getByRole('button', { name: /CDM Export/i }));

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    expect(anchors[0]).toMatchObject({
      href: 'blob:cdm-export',
      download: 'Grand_Prix_2026_-full-export.xlsm',
    });
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
