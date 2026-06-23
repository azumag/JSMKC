/**
 * @jest-environment jsdom
 *
 * Unit tests for the TaParticipantTimeInputRow component (TC-2669 through TC-2673).
 *
 * TaParticipantTimeInputRow is a memoized row component used in the TA
 * (Time Attack) qualification page for each course time entry. It forwards
 * timeInputProps onto the input and fires onChange/onBlur with the courseAbbr.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaParticipantTimeInputRow } from '@/components/tournament/ta-participant-time-input-row';

const onChangeMock = jest.fn();
const onBlurMock = jest.fn();

const defaultProps = {
  courseAbbr: 'MKS',
  value: '',
  placeholder: '0\'00"000',
  disabled: false,
  inputClassName: 'input-cls',
  timeInputProps: { id: 'time-mks', maxLength: 8 } as React.InputHTMLAttributes<HTMLInputElement>,
  onChange: onChangeMock,
  onBlur: onBlurMock,
};

beforeEach(() => {
  onChangeMock.mockClear();
  onBlurMock.mockClear();
});

describe('TaParticipantTimeInputRow', () => {
  it('TC-2669: renders course label with courseAbbr', () => {
    render(<TaParticipantTimeInputRow {...defaultProps} />);

    expect(screen.getByText('MKS')).toBeInTheDocument();
  });

  it('TC-2670: onChange fires with courseAbbr and new value', async () => {
    // userEvent.type fires a realistic keystroke sequence (keydown → keypress →
    // input → keyup) rather than a single synthetic change event.  For a
    // controlled input whose value prop is not updated by the mock, each
    // character triggers one onChange call.  We type a single character so the
    // assertion on call count and forwarded value remain unambiguous.
    const user = userEvent.setup();
    render(<TaParticipantTimeInputRow {...defaultProps} />);

    await user.type(screen.getByRole('textbox'), '1');

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenCalledWith('MKS', '1');
  });

  it('TC-2671: onBlur fires with courseAbbr when input loses focus', async () => {
    // userEvent.tab() shifts focus away from the input, generating the same
    // blur/focusout sequence a real user would trigger with the keyboard.
    const user = userEvent.setup();
    render(<TaParticipantTimeInputRow {...defaultProps} />);

    await user.click(screen.getByRole('textbox'));
    await user.tab();

    expect(onBlurMock).toHaveBeenCalledTimes(1);
    expect(onBlurMock).toHaveBeenCalledWith('MKS');
  });

  it('TC-2672: input is disabled when disabled prop is true', () => {
    render(<TaParticipantTimeInputRow {...defaultProps} disabled={true} />);

    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('TC-2673: input shows value and placeholder from props and spreads timeInputProps', () => {
    const timeValue = "1'23\"456";
    const timePlaceholder = "mm'ss\"mmm";
    render(
      <TaParticipantTimeInputRow
        {...defaultProps}
        value={timeValue}
        placeholder={timePlaceholder}
      />,
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe(timeValue);
    expect(input.placeholder).toBe(timePlaceholder);
    // timeInputProps spread: id is forwarded
    expect(input.id).toBe('time-mks');
  });
});
