/**
 * @jest-environment jsdom
 *
 * Unit tests for the TaParticipantTimeInputRow component (TC-2669 through TC-2673).
 *
 * TaParticipantTimeInputRow is a memoized row component used in the TA
 * (Time Attack) qualification page for each course time entry. It forwards
 * timeInputProps onto the input and fires onChange/onBlur with the courseAbbr.
 */
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('TC-2670: onChange fires with courseAbbr and new value', () => {
    render(<TaParticipantTimeInputRow {...defaultProps} />);

    const timeValue = "1'23\"456";
    fireEvent.change(screen.getByRole('textbox'), { target: { value: timeValue } });

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenCalledWith('MKS', timeValue);
  });

  it('TC-2671: onBlur fires with courseAbbr when input loses focus', () => {
    render(<TaParticipantTimeInputRow {...defaultProps} />);

    fireEvent.blur(screen.getByRole('textbox'));

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
