// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Try using jest.mock with module path instead of alias
jest.mock('../../src/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(),
  getServerSideIdentifier: jest.fn(),
}));

import { checkRateLimit } from '@/lib/rate-limit';

describe('Mock Debug 2 - relative path', () => {
  it('should check if relative path mock works', () => {
    console.log('checkRateLimit is mock:', jest.isMockFunction(checkRateLimit));
    expect(jest.isMockFunction(checkRateLimit)).toBe(true);
  });
});
