/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportButton } from '@/components/tournament/export-button';

describe('ExportButton', () => {
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.URL.createObjectURL = jest.fn(() => 'blob:cdm-export');
    window.URL.revokeObjectURL = jest.fn();
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
});
