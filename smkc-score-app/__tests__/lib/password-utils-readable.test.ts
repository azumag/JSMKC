import { describe, expect, it } from '@jest/globals';
import { generateSecurePassword, READABLE_PASSWORD_CHARSET } from '@/lib/password-utils';

describe('readable generated passwords', () => {
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

  it('keeps uppercase, lowercase, digit, and symbol categories available', () => {
    expect(READABLE_PASSWORD_CHARSET).toMatch(/[A-Z]/);
    expect(READABLE_PASSWORD_CHARSET).toMatch(/[a-z]/);
    expect(READABLE_PASSWORD_CHARSET).toMatch(/[2-9]/);
    expect(READABLE_PASSWORD_CHARSET).toMatch(/[!@#$%&*]/);
  });
});
