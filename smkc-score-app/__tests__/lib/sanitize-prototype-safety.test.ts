import { describe, expect, it } from '@jest/globals';
import { sanitizeInput, sanitizeObject } from '@/lib/sanitize';

describe('sanitizeObject prototype safety', () => {
  it('keeps __proto__ as an own data property without changing the result prototype', () => {
    const input = JSON.parse(
      '{"__proto__":{"polluted":"<script>alert(1)</script>safe"},"name":"<script>alert(2)</script>player"}',
    ) as Record<string, unknown>;

    const result = sanitizeObject(input);
    const protoDescriptor = Object.getOwnPropertyDescriptor(result, '__proto__');

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(protoDescriptor).toBeDefined();
    expect(protoDescriptor?.enumerable).toBe(true);
    expect(protoDescriptor?.writable).toBe(true);
    expect(protoDescriptor?.configurable).toBe(true);

    const sanitizedProtoValue = protoDescriptor?.value as Record<string, unknown>;
    expect(sanitizedProtoValue.polluted).not.toContain('<script');
    expect(result.polluted).toBeUndefined();
    expect(result.name).not.toContain('<script');
  });

  it('preserves prototype safety when __proto__ is nested through sanitizeInput array recursion', () => {
    const input = JSON.parse(
      '{"players":[{"profile":{"__proto__":{"polluted":"<script>alert(3)</script>safe"}}}]}',
    ) as { players: Array<{ profile: Record<string, unknown> }> };

    const result = sanitizeInput(input);
    const profile = result.players[0].profile;
    const protoDescriptor = Object.getOwnPropertyDescriptor(profile, '__proto__');

    expect(Object.getPrototypeOf(profile)).toBe(Object.prototype);
    expect(protoDescriptor).toBeDefined();
    expect(protoDescriptor?.enumerable).toBe(true);
    expect(protoDescriptor?.writable).toBe(true);
    expect(protoDescriptor?.configurable).toBe(true);

    const sanitizedProtoValue = protoDescriptor?.value as Record<string, unknown>;
    expect(sanitizedProtoValue.polluted).not.toContain('<script');
    expect(profile.polluted).toBeUndefined();
  });
});
