/**
 * @jest-environment jsdom
 */

/**
 * Tests for BracketSlotEditDialog (issue #3017): manual bracket slot
 * placement adjustment. Covers candidate filtering (excludes players
 * already confirmed elsewhere), the three save operations' PATCH payload
 * shape, and success/failure feedback.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BracketSlotEditDialog, type SlotEditMatchData } from '@/components/tournament/bracket-slot-edit-dialog';

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
import { toast } from 'sonner';

const player1 = { id: 'p1', name: 'Alice A', nickname: 'Alice' };
const player2 = { id: 'p2', name: 'Bob B', nickname: 'Bob' };
const player9 = { id: 'p9', name: 'Ivy I', nickname: 'Ivy' };
const player10 = { id: 'p10', name: 'Jules J', nickname: 'Jules' };

const buildMatch = (overrides: Partial<SlotEditMatchData> = {}): SlotEditMatchData => ({
  id: 'm1',
  matchNumber: 1,
  round: 'winners_qf',
  completed: false,
  isBye: false,
  version: 2,
  player1Id: player1.id,
  player2Id: player2.id,
  player1,
  player2,
  ...overrides,
});

const bracketStructure = [
  { matchNumber: 1, round: 'winners_qf', bracket: 'winners' as const },
  { matchNumber: 9, round: 'winners_qf', bracket: 'winners' as const },
];

function renderDialog(overrides: Partial<React.ComponentProps<typeof BracketSlotEditDialog>> = {}) {
  const match = overrides.match ?? buildMatch();
  return render(
    <BracketSlotEditDialog
      open
      onOpenChange={jest.fn()}
      finalsApiPath="/api/tournaments/t1/bm/finals"
      qualificationApiPath="/api/tournaments/t1/bm"
      match={match}
      slot={1}
      matches={[match]}
      bracketStructure={bracketStructure}
      onSaved={jest.fn()}
      {...overrides}
    />,
  );
}

describe('BracketSlotEditDialog', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    (toast.success as jest.Mock).mockClear();
    (toast.error as jest.Mock).mockClear();
  });

  it('returns null and renders nothing when no match/slot is selected', () => {
    const { container } = render(
      <BracketSlotEditDialog
        open
        onOpenChange={jest.fn()}
        finalsApiPath="/api/tournaments/t1/bm/finals"
        qualificationApiPath="/api/tournaments/t1/bm"
        match={null}
        slot={null}
        matches={[]}
        bracketStructure={[]}
        onSaved={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('PATCHes op=swap with the current version on the swap tab', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    const onSaved = jest.fn();
    const onOpenChange = jest.fn();
    renderDialog({ onSaved, onOpenChange });

    fireEvent.click(screen.getByTestId('slot-edit-swap-confirm'));
    expect(await screen.findByTestId('slot-edit-confirm-summary')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('slot-edit-confirm-final'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/tournaments/t1/bm/finals');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({
      matchId: 'm1',
      slotEdit: { op: 'swap', expectedVersion: 2 },
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalled();
  });

  it('fetches qualification candidates and excludes players already confirmed in the stage', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          qualifications: [
            { playerId: player1.id, player: player1 },
            { playerId: player2.id, player: player2 },
            { playerId: player9.id, player: player9 },
          ],
        },
      }),
    });

    renderDialog({
      matches: [buildMatch({ id: 'm1', matchNumber: 1, player1Id: player1.id, player2Id: player2.id })],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Assign a different player' }));

    await waitFor(() => expect(screen.getByTestId('slot-edit-assign-select')).toBeInTheDocument());
    const select = screen.getByTestId('slot-edit-assign-select') as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);

    /* player1 and player2 already occupy confirmed slots in match 1; only
     * the unplaced qualification participant (Ivy) should be offered. */
    expect(optionLabels).toContain('Ivy');
    expect(optionLabels).not.toContain('Alice');
    expect(optionLabels).not.toContain('Bob');
  });

  it('PATCHes op=assign with the selected playerId', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/bm/finals')) return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { qualifications: [{ playerId: player9.id, player: player9 }] } }),
      });
    });

    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Assign a different player' }));
    await waitFor(() => expect(screen.getByTestId('slot-edit-assign-select')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('slot-edit-assign-select'), { target: { value: player9.id } });
    fireEvent.click(screen.getByTestId('slot-edit-assign-confirm'));
    expect(await screen.findByTestId('slot-edit-confirm-summary')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('slot-edit-confirm-final'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => url === '/api/tournaments/t1/bm/finals');
      expect(call).toBeDefined();
    });
    const finalsCall = fetchMock.mock.calls.find(([url]) => url === '/api/tournaments/t1/bm/finals')!;
    expect(JSON.parse(finalsCall[1].body)).toEqual({
      matchId: 'm1',
      slotEdit: { op: 'assign', slot: 1, playerId: player9.id, expectedVersion: 2 },
    });
  });

  it('offers only confirmed slots of other matches in the same round for swapSlots, excluding the current match', async () => {
    const other = buildMatch({
      id: 'm9',
      matchNumber: 9,
      round: 'winners_qf',
      player1Id: player9.id,
      player2Id: player10.id,
      player1: player9,
      player2: player10,
      version: 0,
    });
    renderDialog({ matches: [buildMatch(), other] });

    fireEvent.click(screen.getByRole('button', { name: 'Swap with another slot' }));

    const select = screen.getByTestId('slot-edit-swapslots-select') as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels.some((l) => l?.includes('Ivy'))).toBe(true);
    expect(optionLabels.some((l) => l?.includes('Jules'))).toBe(true);
    expect(optionLabels.some((l) => l?.includes('Alice'))).toBe(false);
  });

  it("PATCHes op=swapSlots with both matches' ids/versions", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    const other = buildMatch({
      id: 'm9',
      matchNumber: 9,
      round: 'winners_qf',
      player1Id: player9.id,
      player2Id: player10.id,
      player1: player9,
      player2: player10,
      version: 0,
    });
    renderDialog({ matches: [buildMatch(), other] });

    fireEvent.click(screen.getByRole('button', { name: 'Swap with another slot' }));
    const select = screen.getByTestId('slot-edit-swapslots-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'm9-1' } });
    fireEvent.click(screen.getByTestId('slot-edit-swapslots-confirm'));
    expect(await screen.findByTestId('slot-edit-confirm-summary')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('slot-edit-confirm-final'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      matchId: 'm1',
      slotEdit: {
        op: 'swapSlots',
        slot: 1,
        targetMatchId: 'm9',
        targetSlot: 1,
        expectedVersion: 2,
        targetExpectedVersion: 0,
      },
    });
  });

  it('shows an error toast and keeps the dialog open when the save fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Version conflict' }) });
    const onOpenChange = jest.fn();
    const onSaved = jest.fn();
    renderDialog({ onOpenChange, onSaved });

    fireEvent.click(screen.getByTestId('slot-edit-swap-confirm'));
    fireEvent.click(await screen.findByTestId('slot-edit-confirm-final'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Version conflict'));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows a before/after summary and returns to the tab without saving when Back is clicked', async () => {
    renderDialog();

    fireEvent.click(screen.getByTestId('slot-edit-swap-confirm'));
    expect(await screen.findByTestId('slot-edit-confirm-summary')).toBeInTheDocument();
    expect(screen.getByText('Before: 1P: Alice / 2P: Bob')).toBeInTheDocument();
    expect(screen.getByText('After: 1P: Bob / 2P: Alice')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('slot-edit-confirm-back'));

    expect(screen.queryByTestId('slot-edit-confirm-summary')).not.toBeInTheDocument();
    expect(screen.getByTestId('slot-edit-swap-confirm')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
