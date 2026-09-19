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

function jsonResponse(ok: boolean, body: unknown, status = ok ? 200 : 500) {
  return { ok, status, json: jest.fn(async () => body) };
}

describe('CDM archive reconcile generic error contract (issues #3570, #3872)', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    window.alert = jest.fn();
    window.prompt = jest.fn();
  });

  it('uses common.networkError when preview fails without an API-specific error', async () => {
    const response = jsonResponse(false, {});
    fetchMock.mockResolvedValueOnce(response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Reconcile CDM schedule / re-archive' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('common.networkError'));
    expect(response.json).not.toHaveBeenCalled();
    expect(window.prompt).not.toHaveBeenCalled();
  });

  it('redacts API-specific preview error prose without parsing the failure body', async () => {
    const response = jsonResponse(false, { error: 'preview-specific-error' }, 502);
    fetchMock.mockResolvedValueOnce(response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Reconcile CDM schedule / re-archive' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('common.networkError'));
    expect(window.alert).not.toHaveBeenCalledWith('preview-specific-error');
    expect(response.json).not.toHaveBeenCalled();
  });

  it('uses common.networkError when apply fails without an API-specific error', async () => {
    const previewResponse = jsonResponse(true, { data: preview });
    const applyResponse = jsonResponse(false, {});
    fetchMock.mockResolvedValueOnce(previewResponse).mockResolvedValueOnce(applyResponse);
    window.prompt = jest.fn(() => 'Tournament One');
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Reconcile CDM schedule / re-archive' }));

    await waitFor(() => expect(window.prompt).toHaveBeenCalled());
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('common.networkError'));
    expect(previewResponse.json).toHaveBeenCalledTimes(1);
    expect(applyResponse.json).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('redacts API-specific apply error prose without parsing the failure body', async () => {
    const previewResponse = jsonResponse(true, { data: preview });
    const applyResponse = jsonResponse(false, { data: { error: 'apply-specific-error' } }, 409);
    fetchMock.mockResolvedValueOnce(previewResponse).mockResolvedValueOnce(applyResponse);
    window.prompt = jest.fn(() => 'Tournament One');
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Reconcile CDM schedule / re-archive' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('common.networkError'));
    expect(window.alert).not.toHaveBeenCalledWith('apply-specific-error');
    expect(applyResponse.json).not.toHaveBeenCalled();
  });

  it('documents the fail-closed shared fallback contract', () => {
    const docs = fs.readFileSync(path.join(process.cwd(), 'docs/cdm-archive-reconcile-client-errors.md'), 'utf8');

    expect(docs).toContain('HTTP non-2xx response body は UI 用に解析しない');
    expect(docs).toContain('`common.networkError`');
    expect(docs).toContain('HTTP status');
  });
});
