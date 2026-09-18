/** @jest-environment jsdom */

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

describe('ExportButton runtime error redaction', () => {
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalFetch = global.fetch;
  const mockLogger = (jest.requireMock('@/lib/client-logger').createLogger as jest.Mock).mock.results[0].value;

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectURL;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('logs raw client runtime details without rendering them in the alert', async () => {
    const rawRuntimeDetail = 'blob setup failed via internal-proxy.example:8443';
    global.fetch = jest.fn().mockResolvedValue(new Response(new Blob(['export']), { status: 200 }));
    window.URL.createObjectURL = jest.fn(() => {
      throw new Error(rawRuntimeDetail);
    });

    render(<ExportButton tournamentId="tournament-1">Export</ExportButton>);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Export failed',
        expect.objectContaining({ message: rawRuntimeDetail }),
      );
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Failed to export tournament');
    expect(alert).not.toHaveTextContent(rawRuntimeDetail);
  });
});
