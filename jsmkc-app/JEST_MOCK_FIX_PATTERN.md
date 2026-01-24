# Jest Mock Fix Pattern

## Problem

When using `jest.mock()` with factory functions for modules with named exports, attempting to call `mockReturnValue`, `mockResolvedValue`, and other mock methods on imported functions resulted in:

```
TypeError: _modulename.functionName.mockReturnValue is not a function
```

## Root Cause

The issue occurs because:
1. When you use `jest.mock('@/lib/module', () => ({ fn: jest.fn() }))`, the factory returns a mock object
2. When you import the function with `import { fn } from '@/lib/module'`, TypeScript/Jest doesn't recognize it as a Jest mock
3. Type assertions like `(fn as jest.Mock)` or `(fn as any)` still don't work because the import isn't getting the mocked version correctly

## Solution

### Step 1: Create Manual Mock File

Create a `__mocks__/lib/[module-name].ts` file with Jest mock functions:

```typescript
// __mocks__/lib/rate-limit.ts
export const checkRateLimit = jest.fn();
export const getServerSideIdentifier = jest.fn();
export const rateLimit = jest.fn();
// ... other exports
```

### Step 2: Use jest.requireMock() in Test Files

Instead of importing the mocked function directly, use `jest.requireMock()`:

**Before (doesn't work):**
```typescript
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(),
  getServerSideIdentifier: jest.fn(),
}));

import { checkRateLimit, getServerSideIdentifier } from '@/lib/rate-limit';

// In tests:
(checkRateLimit as jest.Mock).mockResolvedValue({ success: true }); // TypeError!
```

**After (works):**
```typescript
// Keep the jest.mock() declaration
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(),
  getServerSideIdentifier: jest.fn(),
}));

// Don't import directly, use jest.requireMock()
const rateLimitMock = jest.requireMock('@/lib/rate-limit') as {
  checkRateLimit: jest.Mock;
  getServerSideIdentifier: jest.Mock;
};

// In tests:
rateLimitMock.checkRateLimit.mockResolvedValue({ success: true }); // Works!
```

## Modules Fixed

The following modules were fixed using this pattern:

1. **@/lib/rate-limit** - checkRateLimit, getServerSideIdentifier, rateLimit, clearRateLimitStore, getClientIdentifier, getUserAgent
2. **@/lib/sanitize** - sanitizeString, sanitizeObject, sanitizeArray, sanitizeInput
3. **@/lib/pagination** - getPaginationParams, paginate
4. **@/lib/password-utils** - generateSecurePassword, hashPassword, verifyPassword
5. **@/lib/audit-log** - createAuditLog, AUDIT_ACTIONS
6. **@/lib/excel** - escapeCSV, csvRow, createCSV, formatTime, formatDate
7. **@/lib/token-utils** - generateTournamentToken, isValidTokenFormat, isTokenValid, getTokenExpiry, extendTokenExpiry, getTokenTimeRemaining
8. **@/lib/token-validation** - validateToken, getAccessTokenExpiry, validateTournamentToken, requireTournamentToken

## Benefits

1. ✅ Mock functions can now be configured with `mockReturnValue`, `mockResolvedValue`, `mockRejectedValue`, etc.
2. ✅ Type-safe mocking with proper TypeScript types
3. ✅ Consistent pattern across all test files
4. ✅ Easier to maintain and debug
5. ✅ Enables creation of remaining API route tests (30+ routes)

## Related Issue

Resolves: #117 - Fix Jest Mock Issues with checkRateLimit Function
