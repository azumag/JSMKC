/**
 * @module __tests__/lib/client-logger.test.ts
 * Regression test for the client-side logger's Error serialization. Without
 * the JSON.stringify replacer, an Error in meta serializes to `{}` because
 * `name`/`message`/`stack` are non-enumerable — production logs end up showing
 * `Failed to fetch data: {"error":{}}` instead of the actual cause. Found
 * during a manual E2E pass against /tournaments/<id>/ta/phase1 in JA locale,
 * where ta-elimination-phase.tsx emitted exactly that useless line.
 */
import { serializeMeta } from '@/lib/client-logger';

describe('client-logger serializeMeta', () => {
  it('serializes plain objects with JSON semantics', () => {
    const out = serializeMeta({ tournamentId: 'abc', count: 3 });
    expect(JSON.parse(out)).toEqual({ tournamentId: 'abc', count: 3 });
  });

  it('expands Error instances to { name, message, stack } instead of {}', () => {
    const err = new Error('Failed to fetch phase1');
    const out = serializeMeta({ error: err, tournamentId: 'tid_1' });
    const parsed = JSON.parse(out);
    expect(parsed.error.name).toBe('Error');
    expect(parsed.error.message).toBe('Failed to fetch phase1');
    expect(typeof parsed.error.stack).toBe('string');
    expect(parsed.error.stack).toContain('Failed to fetch phase1');
    expect(parsed.tournamentId).toBe('tid_1');
  });

  it('expands custom Error subclasses (e.g. TypeError) the same way', () => {
    const err = new TypeError('not a function');
    const parsed = JSON.parse(serializeMeta({ error: err }));
    expect(parsed.error.name).toBe('TypeError');
    expect(parsed.error.message).toBe('not a function');
  });

  it('handles nested Errors (e.g. inside an array)', () => {
    const out = serializeMeta({ errors: [new Error('a'), new Error('b')] });
    const parsed = JSON.parse(out);
    expect(parsed.errors).toHaveLength(2);
    expect(parsed.errors[0].message).toBe('a');
    expect(parsed.errors[1].message).toBe('b');
  });
});
