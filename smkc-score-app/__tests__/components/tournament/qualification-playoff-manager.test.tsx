/**
 * @jest-environment jsdom
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QualificationPlayoffManager } from '@/components/tournament/qualification-playoff-manager';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === 'playoffGroupTitle') return `Playoff rank ${values?.rank}`;
    if (key === 'broadcastReflect') return 'Broadcast';
    if (key === 'saving') return 'Saving';
    if (key === 'recordPlayoffResult') return 'Record result';
    return key;
  },
}));

describe('QualificationPlayoffManager broadcast', () => {
  it('updates the lower-frame label when broadcasting a 2P qualification playoff', async () => {
    const onBroadcast = jest.fn().mockResolvedValue(true);

    render(
      <QualificationPlayoffManager
        groups={[
          {
            id: 'group-a-rank-3',
            rank: 3,
            players: [
              { id: 'q1', nickname: 'Mario', _autoRank: 3, rankOverride: null },
              { id: 'q2', nickname: 'Luigi', _autoRank: 3, rankOverride: null },
            ],
          },
        ]}
        isAdmin
        onSave={jest.fn()}
        onBroadcast={onBroadcast}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Broadcast' }));

    await waitFor(() => expect(onBroadcast).toHaveBeenCalledTimes(1));
    expect(onBroadcast).toHaveBeenCalledWith('Mario', 'Luigi', {
      matchLabel: 'Playoff rank 3',
      player1Wins: null,
      player2Wins: null,
      matchFt: null,
    });
  });

  it('serializes same-render playoff result saves while the first save is pending', async () => {
    let resolveSave!: (value: boolean) => void;
    const onSave = jest.fn().mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveSave = resolve;
      }),
    );

    render(
      <QualificationPlayoffManager
        groups={[
          {
            id: 'group-a-rank-3',
            rank: 3,
            players: [
              { id: 'q1', nickname: 'Mario', _autoRank: 3, rankOverride: null },
              { id: 'q2', nickname: 'Luigi', _autoRank: 3, rankOverride: null },
            ],
          },
        ]}
        isAdmin
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Record result' }));
    const saveButton = await screen.findByRole('button', { name: 'savePlayoffResult' });

    act(() => {
      saveButton.click();
      saveButton.click();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith([
      { id: 'q1', nickname: 'Mario', _autoRank: 3, rankOverride: null },
      { id: 'q2', nickname: 'Luigi', _autoRank: 3, rankOverride: null },
    ]);

    await act(async () => {
      resolveSave(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'savePlayoffResult' })).not.toBeInTheDocument(),
    );
  });
});
