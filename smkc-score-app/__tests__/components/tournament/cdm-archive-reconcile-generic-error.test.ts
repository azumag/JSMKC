/** @jest-environment jsdom */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CdmArchiveReconcileButton } from '@/components/tournament/cdm-archive-reconcile-button';

jest.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

jest.mock('@/lib/client-logger', () => ({
  createLogger: () => ({ error: jest.fn() }),
}));

const modeSummary = {
  skipped: false,
  sourceMatchCount: 1,
  targetMatchCount: 1,
  realMatchCount: 1,
  rowUpdates: 0,
  movedMatches: 0,
  sideSwaps: 0,
  courseUpdates: 0,
  cupUpdates: 0,
  createdBreaks: 0,
  deletedBreaks: 0,
};

const preview = {
  digest: 'digest-1',
  totalChanges: 0,
  requiresScheduleMethodUpdate: false,
  archivePending: false,
  modes: { bm: modeSummary, mr: modeSummary, gp: modeSummary },
};

function renderButton() {
  render(
    React.createElement(CdmArchiveReconcileButton, {
      tournamentId: 'tournament-1',
      tournamentName: 'Tournament One',
      status: 'completed',
      excluded: false,
      archivePending: false,
    }),
  );
}

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body };
}

describe('CDM archive reconcile generic error contract (issue #3570)', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    window.alert = jest.fn();
    window.prompt = jest.fn();
  });

  it('uses common.networkError when preview fails without an API-specific error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(false, {}));
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Reconcile CDM schedule / re-archive' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('common.networkError'));
    expect(window.prompt).not.toHaveBeenCalled();
  });

  it('keeps an API-specific preview error ahead of the shared fallback', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(false, { error: 'preview-specific-error' }));
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Reconcile CDM schedule / re-archive' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('preview-specific-error'));
  });

  it('uses common.networkError when apply fails without an API-specific error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, { data: preview })).mockResolvedValueOnce(jsonResponse(false, {}));
    window.prompt = jest.fn(() => 'Tournament One');
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Reconcile CDM schedule / re-archive' }));

    await waitFor(() => expect(window.prompt).toHaveBeenCalled());
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('common.networkError'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps an API-specific apply error ahead of the shared fallback', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, { data: preview }))
      .mockResolvedValueOnce(jsonResponse(false, { data: { error: 'apply-specific-error' } }));
    window.prompt = jest.fn(() => 'Tournament One');
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Reconcile CDM schedule / re-archive' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('apply-specific-error'));
  });

  it('documents the shared fallback contract', () => {
    const docs = fs.readFileSync(path.join(process.cwd(), 'docs/cdm-archive-reconcile-client-errors.md'), 'utf8');

    expect(docs).toContain('API response の `error` / `data.error` / `message`');
    expect(docs).toContain('preview/apply failure は `common.networkError`');
  });
});
