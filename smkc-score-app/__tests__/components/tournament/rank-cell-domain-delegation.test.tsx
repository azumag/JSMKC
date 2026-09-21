/**
 * @jest-environment jsdom
 *
 * Keeps RankCell's client-side responsibility limited to parsing safe integers.
 * Business-domain rank bounds belong to the mutation/API layer.
 *
 * Refs #3958.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RankCell } from '@/components/tournament/rank-cell';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      rankInput: 'Rank override',
      editRank: 'Edit rank',
      saveRank: 'Save rank',
      clearRankOverride: 'Clear rank override',
      invalidRank: 'Enter a whole-number rank.',
      networkError: 'Network error',
    })[key] ?? key,
}));

jest.mock('@/lib/client-logger', () => ({
  createLogger: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }),
}));

describe('RankCell API-owned rank domain', () => {
  it('delegates a negative safe integer instead of enforcing a client-side rank minimum', async () => {
    const onSave = jest.fn().mockResolvedValue(true);

    render(<RankCell qualificationId="qual-negative" rankOverride={null} autoRank={3} isAdmin={true} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    const input = screen.getByRole('spinbutton', { name: 'Rank override' });
    fireEvent.change(input, { target: { value: '-1' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(onSave).toHaveBeenCalledWith('qual-negative', -1);
    expect(screen.queryByRole('spinbutton', { name: 'Rank override' })).toBeNull();
  });
});
