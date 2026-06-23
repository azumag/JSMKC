/**
 * @jest-environment jsdom
 *
 * Unit tests for the RankCell component (TC-2643 through TC-2652).
 *
 * RankCell displays a rank number in a standings table, with admin-only
 * inline editing to set or clear a rank override.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RankCell } from '@/components/tournament/rank-cell';

const noop = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
  noop.mockClear();
});

describe('RankCell — view mode', () => {
  it('TC-2643: non-admin sees auto rank when no override is set', () => {
    render(
      <RankCell
        qualificationId="qual-1"
        rankOverride={null}
        autoRank={3}
        isAdmin={false}
        onSave={noop}
      />,
    );

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('TC-2644: non-admin sees amber override badge when rankOverride is set', () => {
    render(
      <RankCell
        qualificationId="qual-1"
        rankOverride={2}
        autoRank={5}
        isAdmin={false}
        onSave={noop}
      />,
    );

    // Override value is shown, not auto rank
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('5')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('TC-2645: admin sees auto rank and edit button', () => {
    render(
      <RankCell
        qualificationId="qual-1"
        rankOverride={null}
        autoRank={4}
        isAdmin={true}
        onSave={noop}
      />,
    );

    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit rank' })).toBeInTheDocument();
  });

  it('TC-2646: admin sees override badge and edit button when override exists', () => {
    render(
      <RankCell
        qualificationId="qual-1"
        rankOverride={1}
        autoRank={3}
        isAdmin={true}
        onSave={noop}
      />,
    );

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('3')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit rank' })).toBeInTheDocument();
  });
});

describe('RankCell — edit mode', () => {
  it('TC-2647: clicking edit opens input with empty string when no override exists', () => {
    render(
      <RankCell
        qualificationId="qual-1"
        rankOverride={null}
        autoRank={4}
        isAdmin={true}
        onSave={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));

    const input = screen.getByRole('spinbutton');
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('');
    // Clear button must not appear when rankOverride is null
    expect(screen.queryByRole('button', { name: /✕/ })).toBeNull();
  });

  it('TC-2648: clicking edit opens input prefilled with current override value', () => {
    render(
      <RankCell
        qualificationId="qual-1"
        rankOverride={7}
        autoRank={3}
        isAdmin={true}
        onSave={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));

    const input = screen.getByRole('spinbutton');
    expect((input as HTMLInputElement).value).toBe('7');
    // Clear button must appear when rankOverride is set
    expect(screen.getByRole('button', { name: /✕/ })).toBeInTheDocument();
  });

  it('TC-2649: pressing Enter calls onSave with parsed number and closes editor', async () => {
    render(
      <RankCell
        qualificationId="qual-42"
        rankOverride={null}
        autoRank={2}
        isAdmin={true}
        onSave={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '5' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(noop).toHaveBeenCalledWith('qual-42', 5);
    // After saving, edit mode closes and view mode is shown
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit rank' })).toBeInTheDocument();
  });

  it('TC-2650: clicking ✓ button calls onSave and closes editor', async () => {
    render(
      <RankCell
        qualificationId="qual-7"
        rankOverride={null}
        autoRank={1}
        isAdmin={true}
        onSave={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '3' } });

    await act(async () => {
      fireEvent.click(screen.getByText('✓'));
    });

    expect(noop).toHaveBeenCalledWith('qual-7', 3);
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('TC-2651: pressing Escape cancels edit without calling onSave', () => {
    render(
      <RankCell
        qualificationId="qual-1"
        rankOverride={null}
        autoRank={6}
        isAdmin={true}
        onSave={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '9' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(noop).not.toHaveBeenCalled();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit rank' })).toBeInTheDocument();
  });

  it('TC-2652: clicking ✕ button clears the override (calls onSave with null)', async () => {
    render(
      <RankCell
        qualificationId="qual-99"
        rankOverride={3}
        autoRank={5}
        isAdmin={true}
        onSave={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    expect(screen.getByRole('button', { name: /✕/ })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /✕/ }));
    });

    expect(noop).toHaveBeenCalledWith('qual-99', null);
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
});

describe('RankCell — edge cases', () => {
  it('TC-2657: empty string input + Enter calls onSave with null (parseInt("") === NaN)', async () => {
    // The implementation converts empty input via parseInt("") = NaN → treats as null (clear)
    render(
      <RankCell
        qualificationId="qual-empty"
        rankOverride={null}
        autoRank={2}
        isAdmin={true}
        onSave={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    const input = screen.getByRole('spinbutton');
    // Leave input empty (default value is already "")

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(noop).toHaveBeenCalledWith('qual-empty', null);
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('TC-2658: input "0" + Enter calls onSave with 0 (rank 0 passes isNaN check)', async () => {
    // parseInt("0") = 0, isNaN(0) = false → saved as 0. Callers should guard against rank 0 if needed.
    render(
      <RankCell
        qualificationId="qual-zero"
        rankOverride={null}
        autoRank={3}
        isAdmin={true}
        onSave={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '0' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(noop).toHaveBeenCalledWith('qual-zero', 0);
    // Editor closes after save, same as other numeric values
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('TC-2659: commitSave closes editor on success and keeps it open while in-flight', async () => {
    // With try/catch in commitSave, setIsEditing(false) is called only on success.
    // While onSave is in-flight the editor stays open; after it resolves, the editor closes.
    let resolveOnSave!: () => void;
    const controlledSave = jest.fn().mockImplementation(
      () => new Promise<void>(resolve => { resolveOnSave = resolve; }),
    );

    render(
      <RankCell
        qualificationId="qual-pend"
        rankOverride={null}
        autoRank={3}
        isAdmin={true}
        onSave={controlledSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '1' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    // commitSave is awaiting onSave — setIsEditing(false) not yet called → editor open
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(controlledSave).toHaveBeenCalledWith('qual-pend', 1);

    // Resolve the save: setIsEditing(false) now runs and the editor closes
    await act(async () => { resolveOnSave(); });
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('TC-2660: commitSave shows inline error and keeps editor open when onSave rejects', async () => {
    // try/catch in commitSave catches the rejection, shows an error message, and
    // keeps the editor open so the user can see the message and retry.
    const failingSave = jest.fn().mockRejectedValue(new Error('Network error'));

    render(
      <RankCell
        qualificationId="qual-err"
        rankOverride={null}
        autoRank={3}
        isAdmin={true}
        onSave={failingSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '2' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    // Editor stays open
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    // Error message is shown
    expect(screen.getByRole('alert')).toHaveTextContent('Network error');
  });

  it('TC-2661: error message is cleared when the editor is reopened', async () => {
    // After a failed save, reopening the editor (openEdit) clears the previous error.
    const failingSave = jest.fn()
      .mockRejectedValueOnce(new Error('Server error'))
      .mockResolvedValue(undefined);

    render(
      <RankCell
        qualificationId="qual-retry"
        rankOverride={null}
        autoRank={4}
        isAdmin={true}
        onSave={failingSave}
      />,
    );

    // First attempt → error
    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } });
    await act(async () => { fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Enter' }); });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Press Escape to close editor
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Escape' });
    // Reopen: error should be gone
    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('TC-2662: commitClear shows inline error and keeps editor open when onSave rejects', async () => {
    // commitClear has the same try/catch pattern as commitSave.
    const failingSave = jest.fn().mockRejectedValue(new Error('Clear failed'));

    render(
      <RankCell
        qualificationId="qual-clear-err"
        rankOverride={5}
        autoRank={3}
        isAdmin={true}
        onSave={failingSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit rank' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /✕/ }));
    });

    // Editor stays open
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    // Error message is shown
    expect(screen.getByRole('alert')).toHaveTextContent('Clear failed');
  });
});
