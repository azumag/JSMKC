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

  it('serializes same-render and cross-group broadcasts until the pending broadcast settles', async () => {
    let resolveBroadcast!: (value: boolean) => void;
    const onBroadcast = jest
      .fn()
      .mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
          resolveBroadcast = resolve;
        }),
      )
      .mockResolvedValueOnce(true);

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
          {
            id: 'group-b-rank-5',
            rank: 5,
            players: [
              { id: 'q3', nickname: 'Peach', _autoRank: 5, rankOverride: null },
              { id: 'q4', nickname: 'Toad', _autoRank: 5, rankOverride: null },
            ],
          },
        ]}
        isAdmin
        onSave={jest.fn()}
        onBroadcast={onBroadcast}
      />,
    );

    const [firstBroadcast, secondBroadcast] = screen.getAllByRole('button', { name: 'Broadcast' });
    act(() => {
      firstBroadcast.click();
      firstBroadcast.click();
      secondBroadcast.click();
    });

    expect(onBroadcast).toHaveBeenCalledTimes(1);
    expect(onBroadcast).toHaveBeenNthCalledWith(1, 'Mario', 'Luigi', {
      matchLabel: 'Playoff rank 3',
      player1Wins: null,
      player2Wins: null,
      matchFt: null,
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Saving' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Broadcast' })).toBeDisabled();
    });

    await act(async () => {
      resolveBroadcast(true);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Broadcast' })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: 'Broadcast' })[1]);

    await waitFor(() => expect(onBroadcast).toHaveBeenCalledTimes(2));
    expect(onBroadcast).toHaveBeenNthCalledWith(2, 'Peach', 'Toad', {
      matchLabel: 'Playoff rank 5',
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

    await waitFor(() => expect(screen.queryByRole('button', { name: 'savePlayoffResult' })).not.toBeInTheDocument());
  });
});
