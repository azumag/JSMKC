# Logger Tests Failing: Two Test Failures in logger.test.ts

## Summary
Two tests in `__tests__/lib/logger.test.ts` are failing, indicating issues with the logger implementation or test expectations.

## Test Failures

### 1. `should not log when environment is not test`
- **Location**: `__tests__/lib/logger.test.ts:187`
- **Error**: `expect(jest.fn()).toHaveBeenCalled()`
- **Expected**: `winston.createLogger` to be called
- **Received**: `winston.createLogger` was called 0 times

### 2. `should handle very long service name`
- **Location**: `__tests__/lib/logger.test.ts:475`
- **Error**: `expect(consoleErrorSpy).toHaveBeenCalledWith(...expected)`
- **Expected**: Console error spy to be called with a specific string format
- **Received**: Console error spy received a different format (missing expected parts)

## Acceptance Criteria
- Both test failures should be resolved
- Tests should pass without any failures
- The logger implementation should handle edge cases correctly

## Priority
Medium - Tests are failing, need to fix the issue

## Related Files
- `jsmkc-app/src/lib/logger.ts`
- `jsmkc-app/__tests__/lib/logger.test.ts`
