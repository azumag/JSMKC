import { serializeMeta } from '@/lib/client-logger';

const SERIALIZATION_FALLBACK = '{"serializationError":"[Unserializable metadata]"}';

describe('client logger accessor serialization failures', () => {
  it('falls back when an enumerable metadata getter throws', () => {
    const meta: Record<string, unknown> = { safe: 'visible' };
    Object.defineProperty(meta, 'payload', {
      enumerable: true,
      get() {
        throw new Error('secret-getter-value');
      },
    });

    const serialized = serializeMeta(meta);

    expect(serialized).toBe(SERIALIZATION_FALLBACK);
    expect(serialized).not.toContain('secret-getter-value');
    expect(serialized).not.toContain('visible');
  });

  it('falls back when a metadata Proxy throws while enumerating keys', () => {
    const meta = new Proxy<Record<string, unknown>>(
      { safe: 'visible' },
      {
        ownKeys() {
          throw new Error('secret-own-keys-value');
        },
      },
    );

    const serialized = serializeMeta(meta);

    expect(serialized).toBe(SERIALIZATION_FALLBACK);
    expect(serialized).not.toContain('secret-own-keys-value');
    expect(serialized).not.toContain('visible');
  });
});
