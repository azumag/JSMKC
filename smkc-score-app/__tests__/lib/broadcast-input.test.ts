import { nullableBroadcastIntegerInput } from '@/lib/broadcast-input';

describe('nullableBroadcastIntegerInput', () => {
  it.each([
    ['', null],
    ['   ', null],
    ['3', 3],
    [' 04 ', 4],
    ['1.9', 1],
    ['0.5', 0],
    ['-1', 0],
    ['abc', null],
    ['Infinity', null],
  ])('parses "%s" to %s', (value, expected) => {
    expect(nullableBroadcastIntegerInput(value)).toBe(expected);
  });
});
