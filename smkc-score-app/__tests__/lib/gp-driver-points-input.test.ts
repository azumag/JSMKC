import { MAX_GP_DRIVER_POINTS } from '@/lib/constants';
import {
  GP_DRIVER_POINTS_INPUT_PROPS,
  parseGpDriverPointsInput,
  canSubmitGpParticipantPoints,
} from '@/lib/gp-driver-points-input';

describe('GP driver points input', () => {
  it('uses mobile numeric keyboard hints for driver-point fields', () => {
    expect(GP_DRIVER_POINTS_INPUT_PROPS).toEqual({
      type: 'text',
      inputMode: 'numeric',
      pattern: '[0-9]*',
      autoComplete: 'off',
    });
  });

  it('parses integer driver points up to the shared GP maximum', () => {
    expect(parseGpDriverPointsInput('0')).toBe(0);
    expect(parseGpDriverPointsInput(String(MAX_GP_DRIVER_POINTS))).toBe(MAX_GP_DRIVER_POINTS);
    expect(parseGpDriverPointsInput(`  ${MAX_GP_DRIVER_POINTS}  `)).toBe(MAX_GP_DRIVER_POINTS);
  });

  it('rejects decimals, signed values, non-numeric values, unsafe integers, and max overflows', () => {
    expect(parseGpDriverPointsInput('1.5')).toBeNull();
    expect(parseGpDriverPointsInput('-1')).toBeNull();
    expect(parseGpDriverPointsInput('+1')).toBeNull();
    expect(parseGpDriverPointsInput('1e2')).toBeNull();
    expect(parseGpDriverPointsInput('abc')).toBeNull();
    expect(parseGpDriverPointsInput('')).toBeNull();
    expect(parseGpDriverPointsInput('   ')).toBeNull();
    expect(parseGpDriverPointsInput(String(Number.MAX_SAFE_INTEGER) + '0')).toBeNull();
    expect(parseGpDriverPointsInput(String(MAX_GP_DRIVER_POINTS + 1))).toBeNull();
  });
});

describe('GP participant driver points submission gate', () => {
  it("allows submitting once at least one side has a valid explicit value, treating the other side's blank field as an implicit 0", () => {
    // A genuine 0 total (e.g. finishing 5th-8th in every race) is common,
    // but the placeholder="0" shown in the empty input is visual only and
    // is never part of the field's actual value. Requiring players to
    // notice that and manually type "0" left the submit button
    // permanently disabled with no feedback (issue: GP group-stage score
    // submission blocked). Blank now means "0" once the player has
    // engaged with the form at all.
    expect(canSubmitGpParticipantPoints('32', '')).toBe(true);
    expect(canSubmitGpParticipantPoints('', '9')).toBe(true);
    expect(canSubmitGpParticipantPoints('0', '0')).toBe(true);
  });

  it('keeps the submit button disabled when both sides are untouched, to avoid an accidental 0-0 submission', () => {
    expect(canSubmitGpParticipantPoints('', '')).toBe(false);
  });

  it('rejects out-of-range or malformed values on either side even when the other side is valid', () => {
    expect(canSubmitGpParticipantPoints(String(MAX_GP_DRIVER_POINTS + 1), '0')).toBe(false);
    expect(canSubmitGpParticipantPoints('9', '-1')).toBe(false);
    expect(canSubmitGpParticipantPoints('9', 'abc')).toBe(false);
    // A whitespace-only side is not the same as blank ("") and must not be
    // silently treated as an implicit 0.
    expect(canSubmitGpParticipantPoints('9', ' ')).toBe(false);
  });
});
