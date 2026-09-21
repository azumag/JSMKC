import {
  invalidBroadcastIntegerInputLabels,
  isBroadcastIntegerInputValid,
  nullableBroadcastIntegerInput,
} from '@/lib/broadcast-input';

describe('nullableBroadcastIntegerInput', () => {
  it.each([
    ['', null],
    ['   ', null],
    ['3', 3],
    [' 04 ', 4],
    ['+2', 2],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
    ['1.9', null],
    ['0.5', null],
    ['-1', null],
    ['1e2', null],
    ['0x10', null],
    ['0b10', null],
    ['9007199254740992', null],
    ['abc', null],
    ['Infinity', null],
  ])('parses "%s" to %s', (value, expected) => {
    expect(nullableBroadcastIntegerInput(value)).toBe(expected);
  });
});

describe('isBroadcastIntegerInputValid', () => {
  it.each([
    ['', true],
    ['4', true],
    [' 04 ', true],
    ['+2', true],
    ['9007199254740991', true],
    ['1.9', false],
    ['-1', false],
    ['1e2', false],
    ['0x10', false],
    ['0b10', false],
    ['9007199254740992', false],
    ['abc', false],
    ['Infinity', false],
  ])('reports "%s" validity as %s', (value, expected) => {
    expect(isBroadcastIntegerInputValid(value)).toBe(expected);
  });
});

describe('invalidBroadcastIntegerInputLabels', () => {
  it('returns no labels when all fields are valid or empty', () => {
    expect(
      invalidBroadcastIntegerInputLabels([
        { label: '1P 点数', value: '' },
        { label: '2P 点数', value: '0' },
        { label: 'FT', value: '3' },
      ]),
    ).toEqual([]);
  });

  it('returns the single invalid field label', () => {
    expect(
      invalidBroadcastIntegerInputLabels([
        { label: '1P 点数', value: '2' },
        { label: '2P 点数', value: '-1' },
        { label: 'FT', value: '' },
      ]),
    ).toEqual(['2P 点数']);
  });

  it('returns all invalid field labels in display order', () => {
    expect(
      invalidBroadcastIntegerInputLabels([
        { label: '1P 点数', value: '1.5' },
        { label: '2P 点数', value: '1e2' },
        { label: 'FT', value: '3' },
      ]),
    ).toEqual(['1P 点数', '2P 点数']);
  });
});
