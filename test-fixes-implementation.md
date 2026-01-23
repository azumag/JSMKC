# Test Suite Performance and Console Error Fixes - Implementation Plan

## Summary of Findings

### Console Error Sources Identified

1. **Client-Side Code (162 console.error calls):**
   - src/app/auth/signin/page.tsx
   - src/app/players/page.tsx
   - src/app/profile/page.tsx
   - src/app/api/**/*.ts files

2. **Server-Side Library Code (Multiple console.error calls):**
   - src/lib/jwt-refresh.ts (2 calls)
   - src/lib/audit-log.ts (1 call)
   - src/lib/token-validation.ts (2 calls)
   - src/lib/ta/promotion.ts (3 calls)
   - src/lib/error-handling.ts (uses logger, not console.error)
   - src/lib/logger.ts (commented code, not actual calls)

3. **Test-Specific Issues:**
   - logger.test.ts has syntax error (uncommented code)
   - auth.test.ts expects console.error to be called but it's not

### Root Causes

1. **Client-Side console.error in Production Code:**
   - These should use the logger system instead of console.error
   - They execute during tests when components render

2. **Server-Side console.error in Library Code:**
   - Should use logger system instead of console.error
   - Execute during test execution

3. **Test Configuration Issues:**
   - Console mocking is commented out in jest.setup.js
   - Logger test environment detection may not be working correctly

## Implementation Plan

### Phase 1: Fix Console Error Sources

1. **Replace console.error in Client-Side Code with Logger:**
   - src/app/auth/signin/page.tsx
   - src/app/players/page.tsx
   - src/app/profile/page.tsx

2. **Replace console.error in Server-Side Library Code with Logger:**
   - src/lib/jwt-refresh.ts
   - src/lib/audit-log.ts
   - src/lib/token-validation.ts
   - src/lib/ta/promotion.ts

3. **Fix Test File Syntax Error:**
   - logger.test.ts (uncommented code causing syntax error)

### Phase 2: Optimize Test Configuration

1. **Enable Console Mocking:**
   - Uncomment console mocking in jest.setup.js
   - Ensure console.error is properly suppressed

2. **Fix Logger Test Environment Detection:**
   - Verify NODE_ENV detection works correctly
   - Ensure logger is fully silent in tests

3. **Update Auth Test:**
   - Fix expectation that console.error should be called
   - Verify logger properly handles errors in tests

### Phase 3: Test Performance Optimization

1. **Optimize Jest Configuration:**
   - Adjust worker settings
   - Optimize test timeout
   - Enable proper caching

2. **Reduce Mock Overhead:**
   - Create module-specific mocks
   - Reduce global mock scope

## Expected Results

1. **No Console Errors:**
   - No console.error output during test execution
   - Clean test output
   - No stack traces in test output

2. **All Tests Pass:**
   - Fix syntax error in logger.test.ts
   - Fix auth test expectation
   - All 364 tests pass

3. **Better Performance:**
   - Reduced console overhead
   - Better test execution speed
   - Cleaner test output

## Implementation Steps

1. Fix logger.test.ts syntax error
2. Replace console.error in client-side code with logger
3. Replace console.error in server-side library code with logger
4. Enable console mocking in jest.setup.js
5. Update auth test expectations
6. Test individual test files
7. Run full test suite
8. Verify performance < 2 minutes
