import {
  isBroadcastIntegerInputValid,
  nullableBroadcastIntegerInput,
} from '@/lib/broadcast-input';

describe('nullableBroadcastIntegerInput', () => {
  it.each([
    ['', null],
    ['   ', null],
    ['3', 3],
    [' 04 ', 4],
    ['1.9', null],
    ['0.5', null],
    ['-1', null],
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
    ['1.9', false],
    ['-1', false],
    ['abc', false],
    ['Infinity', false],
  ])('reports "%s" validity as %s', (value, expected) => {
    expect(isBroadcastIntegerInputValid(value)).toBe(expected);
  });
});
