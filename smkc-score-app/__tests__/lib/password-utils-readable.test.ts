import { describe, expect, it } from '@jest/globals';
import { generateSecurePassword, READABLE_PASSWORD_CHARSET } from '@/lib/password-utils';

const EXPECTED_READABLE_PASSWORD_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';

describe('readable generated passwords', () => {
  it('matches the intended readable character set exactly', () => {
    expect(READABLE_PASSWORD_CHARSET).toBe(EXPECTED_READABLE_PASSWORD_CHARSET);
  });

  it('excludes characters that are easy to confuse visually', () => {
    const ambiguousCharacters = ['I', 'O', 'l', 'o', '0', '1'];

    for (const character of ambiguousCharacters) {
      expect(READABLE_PASSWORD_CHARSET).not.toContain(character);
    }
  });

  it('only generates characters from the readable charset', () => {
    const password = generateSecurePassword(1000);

    for (const character of password) {
      expect(READABLE_PASSWORD_CHARSET).toContain(character);
    }
  });
});
