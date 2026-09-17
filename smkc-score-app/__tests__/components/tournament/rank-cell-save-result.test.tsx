/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RankCell } from '@/components/tournament/rank-cell';

describe('RankCell save result contract', () => {
  it('keeps the editor and entered value when onSave returns false', async () => {
    const onSave = jest.fn().mockResolvedValue(false);

    render(
      <RankCell qualificationId="qual-failed-save" rankOverride={null} autoRank={3} isAdmin={true} onSave={onSave} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '7' } });

    await act(async () => {
      fireEvent.click(screen.getByText('✓'));
    });

    expect(onSave).toHaveBeenCalledWith('qual-failed-save', 7);
    expect(screen.getByRole('spinbutton')).toHaveValue(7);
  });

  it('keeps the editor open when clearing an override returns false', async () => {
    const onSave = jest.fn().mockResolvedValue(false);

    render(
      <RankCell qualificationId="qual-failed-clear" rankOverride={4} autoRank={2} isAdmin={true} onSave={onSave} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /✕/ }));
    });

    expect(onSave).toHaveBeenCalledWith('qual-failed-clear', null);
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
  });

  it('keeps Promise<void> callbacks backward-compatible as successful saves', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);

    render(
      <RankCell qualificationId="qual-void-save" rankOverride={null} autoRank={1} isAdmin={true} onSave={onSave} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });

    await act(async () => {
      fireEvent.click(screen.getByText('✓'));
    });

    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
});
