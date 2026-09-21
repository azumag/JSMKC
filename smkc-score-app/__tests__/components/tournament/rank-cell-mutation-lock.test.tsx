/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RankCell } from '@/components/tournament/rank-cell';

jest.mock('next-intl', () => {
  const translations: Record<string, Record<string, string>> = {
    common: { networkError: 'common.networkError' },
    rankCell: {
      rankInput: 'Rank override',
      editRank: 'Edit rank',
      saveRank: 'Save rank',
      clearRankOverride: 'Clear rank override',
      invalidRank: 'Enter a whole-number rank.',
    },
  };

  return {
    useTranslations: (namespace: string) => (key: string) => translations[namespace]?.[key] ?? `${namespace}.${key}`,
  };
});

jest.mock('@/lib/client-logger', () => ({
  createLogger: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('RankCell pending mutation lock', () => {
  it('blocks duplicate save events while pending and allows retry after a false result', async () => {
    const firstSave = deferred<boolean>();
    const onSave = jest
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue(false);

    render(<RankCell qualificationId="qual-save" rankOverride={null} autoRank={2} isAdmin={true} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    const input = screen.getByRole('spinbutton', { name: 'Rank override' });
    fireEvent.change(input, { target: { value: '4' } });
    const saveButton = screen.getByRole('button', { name: 'Save rank' });

    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenLastCalledWith('qual-save', 4);
    expect(input).toBeDisabled();
    expect(saveButton).toBeDisabled();

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstSave.resolve(false);
      await firstSave.promise;
    });

    expect(screen.getByRole('spinbutton', { name: 'Rank override' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save rank' })).toBeEnabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save rank' }));
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('spinbutton', { name: 'Rank override' })).toBeInTheDocument();
  });

  it('blocks duplicate clear events while pending and closes after a successful clear', async () => {
    const clearSave = deferred<boolean>();
    const onSave = jest.fn().mockImplementation(() => clearSave.promise);

    render(<RankCell qualificationId="qual-clear" rankOverride={5} autoRank={3} isAdmin={true} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    const input = screen.getByRole('spinbutton', { name: 'Rank override' });
    const clearButton = screen.getByRole('button', { name: 'Clear rank override' });

    fireEvent.click(clearButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenLastCalledWith('qual-clear', null);
    expect(input).toBeDisabled();
    expect(clearButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save rank' })).toBeDisabled();

    fireEvent.click(clearButton);
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      clearSave.resolve(true);
      await clearSave.promise;
    });

    expect(screen.queryByRole('spinbutton', { name: 'Rank override' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit rank' })).toBeInTheDocument();
  });
});
