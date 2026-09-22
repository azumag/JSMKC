import { serializeMeta } from '@/lib/client-logger';

describe('client logger metadata serialization', () => {
  it('replaces only true circular references with a stable sentinel', () => {
    const shared = { value: 42 };
    const meta: Record<string, unknown> & { self?: unknown } = {
      first: shared,
      second: shared,
    };
    meta.self = meta;

    expect(JSON.parse(serializeMeta(meta))).toEqual({
      first: { value: 42 },
      second: { value: 42 },
      self: '[Circular]',
    });
  });

  it('keeps Error details when a surrounding metadata graph is cyclic', () => {
    const error = new Error('boom');
    const meta: Record<string, unknown> & { nested?: unknown } = { error };
    const nested = { parent: meta };
    meta.nested = nested;

    const parsed = JSON.parse(serializeMeta(meta)) as {
      error: { name: string; message: string; stack?: string };
      nested: { parent: string };
    };

    expect(parsed.error.name).toBe('Error');
    expect(parsed.error.message).toBe('boom');
    expect(parsed.error.stack).toEqual(expect.any(String));
    expect(parsed.nested.parent).toBe('[Circular]');
  });
});
