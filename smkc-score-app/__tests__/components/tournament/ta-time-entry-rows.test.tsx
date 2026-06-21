/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { TaTimeEntryRow } from '@/components/tournament/ta-time-entry-row';
import { TaParticipantTimeInputRow } from '@/components/tournament/ta-participant-time-input-row';

const timeInputProps = {
  inputMode: 'decimal',
  autoComplete: 'off',
} as const;

describe('TaTimeEntryRow (finals phase — with livesLabel)', () => {
  it('verifies time input is disabled and TV/retry callbacks work when isRetry=true', () => {
    const onTvChange = jest.fn();
    const onTimeChange = jest.fn();
    const onTimeBlur = jest.fn();
    const onRetryToggle = jest.fn();

    render(
      <TaTimeEntryRow
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

    // isRetry={true} disables the time input; assert before any interactions
    const timeInput = screen.getByPlaceholderText('Time');
    expect(timeInput).toBeDisabled();
    expect(onTimeChange).not.toHaveBeenCalled();
    expect(onTimeBlur).not.toHaveBeenCalled();

    // TV select is independent of isRetry — callbacks still fire
    const tvSelect = screen.getByLabelText('TV number');
    fireEvent.change(tvSelect, { target: { value: '3' } });
    fireEvent.change(tvSelect, { target: { value: '' } });
    expect(onTvChange).toHaveBeenNthCalledWith(1, 'player-1', 3);
    expect(onTvChange).toHaveBeenNthCalledWith(2, 'player-1', null);

    // retry button remains clickable when isRetry=true (toggling off)
    const retryButton = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryButton);
    expect(onRetryToggle).toHaveBeenCalledWith('player-1');
  });

  it('calls time input callbacks when isRetry=false', () => {
    const onTvChange = jest.fn();
    const onTimeChange = jest.fn();
    const onTimeBlur = jest.fn();
    const onRetryToggle = jest.fn();

    render(
      <TaTimeEntryRow
        playerId="player-1"
        playerName="Alice"
        livesLabel="L3"
        tvNumber={2}
        tvLabel="TV number"
        timeValue="1:23.45"
        timePlaceholder="Time"
        isRetry={false}
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

    const timeInput = screen.getByPlaceholderText('Time');
    expect(timeInput).not.toBeDisabled();

    fireEvent.change(timeInput, { target: { value: '1:10.00' } });
    expect(onTimeChange).toHaveBeenCalledWith('player-1', '1:10.00');

    fireEvent.blur(timeInput);
    expect(onTimeBlur).toHaveBeenCalledWith('player-1');
  });

  it('disables retry button when editing is disabled', () => {
    render(
      <TaTimeEntryRow
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

  it('disables both retry button and time input when isRetry=true and isEditingDisabled=true', () => {
    // When both flags are set, time input is disabled by isRetry and retry button by isEditingDisabled
    render(
      <TaTimeEntryRow
        playerId="player-1"
        playerName="Alice"
        livesLabel="L3"
        tvNumber={null}
        tvLabel="TV number"
        timeValue="9:59.99"
        timePlaceholder="Time"
        isRetry={true}
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

    expect(screen.getByPlaceholderText('Time')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
  });

  it('renders livesLabel when provided', () => {
    render(
      <TaTimeEntryRow
        playerId="player-1"
        playerName="Alice"
        livesLabel={<span data-testid="lives">♥♥♥</span>}
        tvNumber={null}
        tvLabel="TV number"
        timeValue=""
        timePlaceholder="Time"
        isRetry={false}
        isEditingDisabled={false}
        retryLabel="Retry"
        retryTitle="Retry time"
        timeInputProps={timeInputProps}
        onTvChange={jest.fn()}
        onTimeChange={jest.fn()}
        onTimeBlur={jest.fn()}
        onRetryToggle={jest.fn()}
      />
    );

    expect(screen.getByTestId('lives')).toBeInTheDocument();
  });

  it('omits livesLabel container when livesLabel is not provided', () => {
    render(
      <TaTimeEntryRow
        playerId="player-2"
        playerName="Bob"
        tvNumber={null}
        tvLabel="TV number"
        timeValue=""
        timePlaceholder="Time"
        isRetry={false}
        isEditingDisabled={false}
        retryLabel="Penalty"
        retryTitle="Toggle penalty"
        timeInputProps={timeInputProps}
        onTvChange={jest.fn()}
        onTimeChange={jest.fn()}
        onTimeBlur={jest.fn()}
        onRetryToggle={jest.fn()}
      />
    );

    // No lives container rendered when livesLabel omitted (elimination phase usage)
    expect(screen.queryByTestId('lives')).not.toBeInTheDocument();
  });
});

describe('TaTimeEntryRow (elimination phase — without livesLabel)', () => {
  it('renders props and calls callbacks with correct arguments', () => {
    const onTvChange = jest.fn();
    const onTimeChange = jest.fn();
    const onTimeBlur = jest.fn();
    const onRetryToggle = jest.fn();

    render(
      <TaTimeEntryRow
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
      <TaTimeEntryRow
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
