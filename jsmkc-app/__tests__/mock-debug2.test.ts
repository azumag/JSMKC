/**
 * @module Mock Debug 2 Test
 *
 * Diagnostic test to verify that Jest mock resolution works correctly
 * for TypeScript path aliases (e.g., '@/lib/rate-limit'). This is used
 * to debug and confirm the jest.setup.js mock configuration is functioning
 * as expected for the rate-limit module.
 *
 * NOTE: We use the global `jest` object (not imported from @jest/globals)
 * inside the jest.mock factory function. When `jest` is imported from
 * @jest/globals, the `jest.fn()` calls inside the factory may create mock
 * functions that are not recognized by the same `jest.isMockFunction()`
 * due to different jest module instances. Using the global jest avoids
 * this ESM binding issue.
 */
// @ts-nocheck

// jest.mock factory runs with the global `jest` object during hoisting,
// so the returned jest.fn() mocks are recognized by jest.isMockFunction().
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(),
  getServerSideIdentifier: jest.fn(),
}));

import { checkRateLimit } from '@/lib/rate-limit';

describe('Mock Debug 2 - alias path mock', () => {
  it('should check if alias path mock works', () => {
    console.log('checkRateLimit is mock:', jest.isMockFunction(checkRateLimit));
    expect(jest.isMockFunction(checkRateLimit)).toBe(true);
  });
});
