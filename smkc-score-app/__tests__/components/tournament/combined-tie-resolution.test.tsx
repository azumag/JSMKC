/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CombinedTieResolution } from '@/components/tournament/combined-tie-resolution';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      tiedRanksWarningAdmin: 'Tie needs playoff',
      playoffGroupTitle: 'Playoff rank 1',
      recordPlayoffResult: 'Record result',
      playoffDialogTitle: 'Record playoff',
      playoffDialogDescription: 'Order the players',
      playoffAssignedRank: 'Assigned rank',
      moveUp: 'Move up',
      moveDown: 'Move down',
      cancel: 'Cancel',
      savePlayoffResult: 'Save result',
      saving: 'Saving',
    })[key] ?? key,
}));

const tiedRankings = [
  {
    id: 'qa',
    _autoRank: 1,
    mp: 4,
    combinedRankOverride: null,
    player: { nickname: 'Mario' },
  },
  {
    id: 'qb',
    _autoRank: 1,
    mp: 4,
    combinedRankOverride: null,
    player: { nickname: 'Luigi' },
  },
];

describe('CombinedTieResolution', () => {
  it('records a complete tied bucket as sequential combined rank overrides', async () => {
    const onSave = jest.fn().mockResolvedValue(true);
    render(<CombinedTieResolution rankings={tiedRankings} isAdmin onSave={onSave} />);

    expect(screen.getByText('Tie needs playoff')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record result' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save result' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith([
        { qualificationId: 'qa', combinedRankOverride: 1 },
        { qualificationId: 'qb', combinedRankOverride: 2 },
      ]),
    );
  });

  it('hides the playoff prompt after distinct combined overrides resolve the tie', () => {
    render(
      <CombinedTieResolution
        rankings={tiedRankings.map((entry, index) => ({
          ...entry,
          _autoRank: index + 1,
          combinedRankOverride: index + 1,
        }))}
        isAdmin
        onSave={jest.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Record result' })).not.toBeInTheDocument();
  });
});
