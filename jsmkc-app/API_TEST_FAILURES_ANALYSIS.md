# API Test Failures Analysis - Issue #112

## Current Status (2026-01-24)

### Test Results Summary
- **Total test suites**: 44
- **Passing test suites**: 1
- **Failing test suites**: 43
- **Total tests**: 612
- **Passing tests**: 114
- **Failing tests**: 498

### API Route Coverage
- **Total API routes**: 45
- **Routes with test files**: 44 (97.8%)
- **Routes without tests**: 1

**Conclusion**: All API routes have test files. The issue is NOT missing tests but FAILING tests.

## Root Causes of Test Failures

### 1. Route Handler Import Issues (Major)

**Problem**: Test files import route handlers incorrectly, causing "X is not defined" errors

**Example Errors**:
```
ReferenceError: tournamentRoute is not defined
ReferenceError: scoreEntryLogsRoute is not defined
```

**Affected Files**:
- `__tests__/app/api/tournaments/[id]/route.test.ts`
  - Imports: `import { GET, POST, PUT } from '@/app/api/tournaments/[id]/route'`
  - Uses: `tournamentRoute.GET`, `tournamentRoute.PUT`, `tournamentRoute.DELETE`
  - Fix needed: Import `DELETE` or create `tournamentRoute` object

- `__tests__/app/api/tournaments/[id]/score-entry-logs/route.test.ts`
  - Similar pattern - undefined `scoreEntryLogsRoute`

**Pattern**:
```typescript
// WRONG (current):
import { GET, POST, PUT } from '@/app/api/tournaments/[id]/route';
// ... later uses tournamentRoute.GET

// CORRECT:
import * as tournamentRoute from '@/app/api/tournaments/[id]/route';
// ... uses tournamentRoute.GET
// OR
import { GET, POST, PUT, DELETE } from '@/app/api/tournaments/[id]/route';
// ... uses GET, POST, PUT, DELETE directly
```

### 2. Logger Mock Configuration Issues (Critical)

**Problem**: `createLogger` mock returns undefined, tests fail with "Cannot read properties of undefined (reading 'error')"

**Root Cause**:
- Manual mock file exists at `__mocks__/lib/logger.ts`
- Tests use `jest.mock('@/lib/logger')` without factory function
- When `jest.requireMock('@/lib/logger').createLogger()` is called, returns undefined

**Affected Files**: All API test files that use logger

**Current Mock**:
```typescript
// __mocks__/lib/logger.ts
export const createLogger = jest.fn(() => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));
```

**Issue**: The factory function `() => ({ ... })` is called during mock setup before Jest context is ready

**Potential Fix**:
```typescript
// Option 1: Use factory function that returns function
export const createLogger = jest.fn((name) => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

// Option 2: In test file, mock implementation after requiring
const loggerMock = jest.requireMock('@/lib/logger') as { createLogger: jest.Mock };
loggerMock.createLogger.mockImplementation((name: string) => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));
```

### 3. Password Utilities Mock Issues (Critical)

**Problem**: Password hashes are real bcrypt hashes instead of mocked values

**Example Error**:
```
Expected: "hashed-password"
Received: "$2b$12$FlZD/GLJMIfd721a0RvrPeBdtFcPPMJIbz7g7MEEJlkWIrJCO5D/y"
```

**Root Cause**: Mock configuration not working, real `hashPassword` function is being called

**Affected Files**: All tests that create players or handle passwords

**Current State**:
```typescript
// Test file:
jest.mock('@/lib/password-utils');  // Uses manual mock

// __mocks__/lib/password-utils.ts:
export const generateSecurePassword = jest.fn();
export const hashPassword = jest.fn();
export const verifyPassword = jest.fn();

// Test setup:
const passwordUtilsMock = jest.requireMock('@/lib/password-utils') as {
  generateSecurePassword: jest.Mock;
  hashPassword: jest.Mock;
};
passwordUtilsMock.hashPassword.mockResolvedValue('hashed-password');
```

**Issue**: Despite mocking, actual bcrypt function is being called

### 4. Pagination Mock Issues (Moderate)

**Problem**: Tests use undefined `paginate` variable instead of `paginationMock.paginate`

**Affected Files**:
- `__tests__/app/api/players/route.test.ts`

**Fix Applied**: Changed `paginate` to `paginationMock.paginate` ✅

### 5. Test Expectation Mismatches (Moderate)

**Problem**: Test expectations don't match actual behavior

**Examples**:
- Password hash values (expected mocked, got real)
- API response data format differences
- Audit log data structure mismatches

## Recommended Fix Strategy

### Phase 1: Fix Critical Mock Issues (Priority: CRITICAL)

1. **Fix logger mock**:
   - Update `__mocks__/lib/logger.ts` to work correctly
   - Ensure `jest.requireMock()` pattern is used consistently
   - Verify in 2-3 test files that logger.error works

2. **Fix password-utils mock**:
   - Debug why manual mock isn't being used
   - Ensure real bcrypt function isn't being called
   - Verify mocked values are returned

### Phase 2: Fix Route Handler Imports (Priority: HIGH)

1. For each test file with "X is not defined" error:
   - Check imports at top of file
   - Check usage in tests
   - Fix to either:
     a) Import missing exports (DELETE, etc.)
     b) Import entire module as namespace
     c) Create route handler object

2. Files to fix (estimated 15-20 files):
   - tournaments/[id]/route.test.ts
   - tournaments/[id]/* subdirectories
   - Other API route tests

### Phase 3: Fix Test Expectations (Priority: MEDIUM)

1. Run tests individually to see actual vs expected
2. Update expectations to match actual behavior
3. Or fix implementation if expectations are correct

### Phase 4: Validation and Coverage (Priority: HIGH)

1. Run all API tests with `npm test -- --testPathPattern="app/api"`
2. Verify all tests pass
3. Run coverage: `npm test -- --coverage --testPathPattern="app/api"`
4. Verify 80% coverage target is met

## Estimated Effort

- **Phase 1 (Mock fixes)**: 1-2 hours
- **Phase 2 (Import fixes)**: 3-4 hours (15-20 files)
- **Phase 3 (Expectation fixes)**: 2-3 hours
- **Phase 4 (Validation)**: 1 hour

**Total estimated**: 7-10 hours of focused debugging

## Alternative Approach: Create New Issue

If time doesn't allow for systematic fixing:

1. Document findings in this analysis document
2. Create new GitHub issue: "Fix 498 failing API tests"
3. Include:
   - Root cause analysis
   - Categorized failure patterns
   - Recommended fix strategy
   - Example fixes for each pattern
4. Close Issue #112 as: "Tests created but need systematic fixing"
5. Return to step 0 to find new issues

## Conclusion

The claim "0% test coverage for server endpoints" in Issue #112 title is **incorrect**.

**Actual situation**:
- ✅ All 44 API routes have test files (97.8% coverage)
- ❌ Tests have systematic bugs and are failing (498/612 tests failing)
- ⏸ Acceptance criterion "All existing tests continue to pass" is NOT met

**Next actions**:
1. Option A: Allocate 7-10 hours to systematically fix all test failures
2. Option B: Create new issue for systematic test fixing, close #112 as incomplete
3. Option C: Fix critical subset (mock issues, 5-10 test files) as proof of concept

Recommendation: Option B - Document findings and create dedicated issue for systematic test fixing.
