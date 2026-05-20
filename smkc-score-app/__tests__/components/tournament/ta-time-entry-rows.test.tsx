/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { TaFinalsTimeEntryRow } from '@/app/tournaments/[id]/ta/finals/page';
import { TAEliminationPhaseRow } from '@/components/tournament/ta-elimination-phase';
import { TaParticipantTimeInputRow } from '@/app/tournaments/[id]/ta/participant/page';

const timeInputProps = {
  inputMode: 'decimal',
  autoComplete: 'off',
} as const;

describe('TaFinalsTimeEntryRow', () => {
  it('renders props and calls callbacks with correct arguments', () => {
    const onTvChange = jest.fn();
    const onTimeChange = jest.fn();
    const onTimeBlur = jest.fn();
    const onRetryToggle = jest.fn();

    render(
      <TaFinalsTimeEntryRow
        playerId="player-1"
        playerName="Alice"
        livesLabel="L3"
        tvNumber={2}
        tvLabel="TV number"
        timeValue="1:23.45"
        timePlaceholder="Time"
        isRetry={true}
        isEditingDisabled={false}
        retryLabel="Retry"
        retryTitle="Retry time"
        timeInputProps={timeInputProps}
        onTvChange={onTvChange}
        onTimeChange={onTimeChange}
        onTimeBlur={onTimeBlur}
        onRetryToggle={onRetryToggle}
      />
    );

    const tvSelect = screen.getByLabelText('TV number');
    fireEvent.change(tvSelect, { target: { value: '3' } });
    fireEvent.change(tvSelect, { target: { value: '' } });
    expect(onTvChange).toHaveBeenNthCalledWith(1, 'player-1', 3);
    expect(onTvChange).toHaveBeenNthCalledWith(2, 'player-1', null);

    const timeInput = screen.getByPlaceholderText('Time');
    fireEvent.change(timeInput, { target: { value: '1:10.00' } });
    expect(onTimeChange).toHaveBeenCalledWith('player-1', '1:10.00');

    fireEvent.blur(timeInput);
    expect(onTimeBlur).toHaveBeenCalledWith('player-1');
    expect(timeInput).toBeDisabled();

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryButton);
    expect(onRetryToggle).toHaveBeenCalledWith('player-1');
  });

  it('disables retry button when editing is disabled', () => {
    render(
      <TaFinalsTimeEntryRow
        playerId="player-1"
        playerName="Alice"
        livesLabel="L3"
        tvNumber={null}
        tvLabel="TV number"
        timeValue="1:23.45"
        timePlaceholder="Time"
        isRetry={false}
        isEditingDisabled={true}
        retryLabel="Retry"
        retryTitle="Retry time"
        timeInputProps={timeInputProps}
        onTvChange={jest.fn()}
        onTimeChange={jest.fn()}
        onTimeBlur={jest.fn()}
        onRetryToggle={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
  });
});

describe('TAEliminationPhaseRow', () => {
  it('renders props and calls callbacks with correct arguments', () => {
    const onTvChange = jest.fn();
    const onTimeChange = jest.fn();
    const onTimeBlur = jest.fn();
    const onRetryToggle = jest.fn();

    render(
      <TAEliminationPhaseRow
        playerId="player-2"
        playerName="Bob"
        tvNumber={1}
        tvLabel="TV number for phase"
        timeValue="0:59.99"
        timePlaceholder="Time"
        isRetry={false}
        isEditingDisabled={false}
        retryLabel="Penalty"
        retryTitle="Toggle penalty"
        timeInputProps={timeInputProps}
        onTvChange={onTvChange}
        onTimeChange={onTimeChange}
        onTimeBlur={onTimeBlur}
        onRetryToggle={onRetryToggle}
      />
    );

    const tvSelect = screen.getByLabelText('TV number for phase');
    fireEvent.change(tvSelect, { target: { value: '4' } });
    fireEvent.change(tvSelect, { target: { value: '' } });
    expect(onTvChange).toHaveBeenNthCalledWith(1, 'player-2', 4);
    expect(onTvChange).toHaveBeenNthCalledWith(2, 'player-2', null);

    const timeInput = screen.getByPlaceholderText('Time');
    fireEvent.change(timeInput, { target: { value: '0:58.12' } });
    fireEvent.blur(timeInput);
    expect(onTimeChange).toHaveBeenCalledWith('player-2', '0:58.12');
    expect(onTimeBlur).toHaveBeenCalledWith('player-2');
    expect(screen.getByRole('button', { name: 'Penalty' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Penalty' }));
    expect(onRetryToggle).toHaveBeenCalledWith('player-2');
  });

  it('disables retry button when editing is disabled', () => {
    render(
      <TAEliminationPhaseRow
        playerId="player-2"
        playerName="Bob"
        tvNumber={null}
        tvLabel="TV number for phase"
        timeValue="0:59.99"
        timePlaceholder="Time"
        isRetry={false}
        isEditingDisabled={true}
        retryLabel="Penalty"
        retryTitle="Toggle penalty"
        timeInputProps={timeInputProps}
        onTvChange={jest.fn()}
        onTimeChange={jest.fn()}
        onTimeBlur={jest.fn()}
        onRetryToggle={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Penalty' })).toBeDisabled();
  });
});

describe('TaParticipantTimeInputRow', () => {
  it('renders props and calls callbacks with correct arguments', () => {
    const onChange = jest.fn();
    const onBlur = jest.fn();

    render(
      <TaParticipantTimeInputRow
        courseAbbr="GV1"
        value="1:23.45"
        placeholder="GV1"
        disabled={false}
        inputClassName="test-class"
        timeInputProps={timeInputProps}
        onChange={onChange}
        onBlur={onBlur}
      />
    );

    const input = screen.getByPlaceholderText('GV1');
    fireEvent.change(input, { target: { value: '1:22.00' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('GV1', '1:22.00');
    expect(onBlur).toHaveBeenCalledWith('GV1');
    expect(input).not.toBeDisabled();
  });

  it('forwards disabled prop', () => {
    render(
      <TaParticipantTimeInputRow
        courseAbbr="GV1"
        value="1:23.45"
        placeholder="GV1"
        disabled={true}
        inputClassName="test-class"
        timeInputProps={timeInputProps}
        onChange={jest.fn()}
        onBlur={jest.fn()}
      />
    );

    expect(screen.getByPlaceholderText('GV1')).toBeDisabled();
  });
});
