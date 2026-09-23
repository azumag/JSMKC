import { serializeMeta } from '@/lib/client-logger';

describe('client logger unserializable metadata', () => {
  it('falls back without exposing an error thrown by custom toJSON', () => {
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
      serialized = serializeMeta(meta);
    }).not.toThrow();

    expect(serialized).toBe('{"serializationError":"[Unserializable metadata]"}');
    expect(serialized).not.toContain('secret-token-should-not-leak');
    expect(serialized).not.toContain('visible');
  });
});
