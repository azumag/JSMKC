/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RankCell } from '@/components/tournament/rank-cell';

jest.mock('next-intl', () => {
  const translations: Record<string, Record<string, string>> = {
    common: {
      networkError: 'common.networkError',
    },
    rankCell: {
      rankInput: 'Rank override',
      editRank: 'Edit rank',
      saveRank: 'Save rank',
      clearRankOverride: 'Clear rank override',
    },
  };

  return {
    useTranslations: (namespace: string) => (key: string) => translations[namespace]?.[key] ?? `${namespace}.${key}`,
  };
});

describe('RankCell save result contract', () => {
  it('keeps the editor and entered value when onSave returns false', async () => {
    const onSave = jest.fn().mockResolvedValue(false);

    render(
      <RankCell qualificationId="qual-failed-save" rankOverride={null} autoRank={3} isAdmin={true} onSave={onSave} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    const input = screen.getByRole('spinbutton', { name: 'Rank override' });
    fireEvent.change(input, { target: { value: '7' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save rank' }));
    });

    expect(onSave).toHaveBeenCalledWith('qual-failed-save', 7);
    expect(screen.getByRole('spinbutton', { name: 'Rank override' })).toHaveValue(7);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the editor open when clearing an override returns false', async () => {
    const onSave = jest.fn().mockResolvedValue(false);

    render(
      <RankCell qualificationId="qual-failed-clear" rankOverride={4} autoRank={2} isAdmin={true} onSave={onSave} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear rank override' }));
    });

    expect(onSave).toHaveBeenCalledWith('qual-failed-clear', null);
    expect(screen.getByRole('spinbutton', { name: 'Rank override' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps Promise<void> callbacks backward-compatible as successful saves', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);

    render(
      <RankCell qualificationId="qual-void-save" rankOverride={null} autoRank={1} isAdmin={true} onSave={onSave} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Rank override' }), { target: { value: '2' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save rank' }));
    });

    expect(screen.queryByRole('spinbutton', { name: 'Rank override' })).toBeNull();
  });

  it('keeps Promise<void> callbacks backward-compatible as successful clears', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);

    render(
      <RankCell qualificationId="qual-void-clear" rankOverride={4} autoRank={1} isAdmin={true} onSave={onSave} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear rank override' }));
    });

    expect(onSave).toHaveBeenCalledWith('qual-void-clear', null);
    expect(screen.queryByRole('spinbutton', { name: 'Rank override' })).toBeNull();
  });
});
