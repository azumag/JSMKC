import { serializeServerLogMeta } from '@/lib/logger';

describe('server logger metadata serialization', () => {
  it('preserves Error details and BigInt while replacing only true cycles', () => {
    const shared = { value: 42 };
    const error = new Error('boom');
    const meta: Record<string, unknown> & { self?: unknown } = {
      error,
      rows: 9007199254740993n,
      nested: { delta: -2n },
      first: shared,
      second: shared,
    };
    meta.self = meta;

    const parsed = JSON.parse(serializeServerLogMeta(meta)) as {
      error: { name: string; message: string; stack?: string };
      rows: string;
      nested: { delta: string };
      first: { value: number };
      second: { value: number };
      self: string;
    };

    expect(parsed.error.name).toBe('Error');
    expect(parsed.error.message).toBe('boom');
    expect(parsed.error.stack).toEqual(expect.any(String));
    expect(parsed.rows).toBe('9007199254740993');
    expect(parsed.nested.delta).toBe('-2');
    expect(parsed.first).toEqual({ value: 42 });
    expect(parsed.second).toEqual({ value: 42 });
    expect(parsed.self).toBe('[Circular]');
  });

  it('uses a non-sensitive fallback when custom toJSON throws', () => {
    const meta = {
      safe: 'visible',
      payload: {
        toJSON() {
          throw new Error('secret-token-should-not-leak');
        },
      },
    };

    let serialized = '';
    expect(() => {
      serialized = serializeServerLogMeta(meta);
    }).not.toThrow();

    expect(serialized).toBe('{"serializationError":"[Unserializable metadata]"}');
    expect(serialized).not.toContain('secret-token-should-not-leak');
    expect(serialized).not.toContain('visible');
  });

  it('keeps Proxy ownKeys failures inside the serialization boundary', () => {
    const meta = new Proxy<Record<string, unknown>>(
      { safe: 'visible' },
      {
        ownKeys() {
          throw new Error('proxy-secret-should-not-leak');
        },
      },
    );

    let serialized = '';
    expect(() => {
      serialized = serializeServerLogMeta(meta);
    }).not.toThrow();

    expect(serialized).toBe('{"serializationError":"[Unserializable metadata]"}');
    expect(serialized).not.toContain('proxy-secret-should-not-leak');
    expect(serialized).not.toContain('visible');
  });
});
