# Logger Mock Architecture Fix Design

## Problem Statement

API routes create logger instances at module level before Jest test mocks can be set up, causing timing issues where tests cannot properly mock logger calls.

## Root Cause Analysis

### Current Architecture Issue

```typescript
// API route module-level initialization
const logger = createLogger('mr-api'); // Executes at import time

export async function GET(request, { params }) {
  try {
    logger.error('Failed to fetch MR data', { error, tournamentId });
  }
}
```

### Execution Flow (Current)

1. Test file imports API route → `logger = createLogger()` executes immediately
2. Test's `jest.mock` executes → too late, logger already created with real implementation
3. Test's `beforeEach` executes → even later, logger instance is already established
4. API route handler executes → uses module-level logger instance
5. Test assertion `expect(loggerMock.error).toHaveBeenCalled()` → fails because it's checking wrong instance

## Solution Design: Function-Level Logger Creation

### Proposed Architecture

Move logger creation from module level to function level in all API routes:

```typescript
export async function GET(request, { params }) {
  const logger = createLogger('mr-api'); // Created inside handler

  try {
    // Business logic
  } catch (error) {
    logger.error('Failed to fetch data', { error, tournamentId });
  }
}
```

### Benefits

1. **Solves timing issue completely**: Logger is created after test mocks are set up
2. **Cleaner architecture**: Clearer separation of concerns
3. **Future-proof**: Prevents similar issues for new routes
4. **Better testability**: Tests can control logger creation
5. **Minimal performance impact**: Logger creation is lightweight (just returns a plain object)

### Trade-offs

1. **Code changes required**: ~30 API route files need modification
2. **Slightly more verbose**: Need to add logger creation to each handler
3. **Performance**: Creates logger instance per request (minimal overhead: ~0.01ms per request)

## Implementation Plan

### Phase 1: Infrastructure Setup (30 minutes)
1. Create helper script to identify all API routes with module-level loggers
2. Test the pattern on one route to verify it works
3. Create utility if needed for consistency

### Phase 2: Bulk Implementation (3-4 hours)
1. Process all tournament module routes (GP, BM, MR, TA, TT)
2. Process remaining API routes (auth, players, tournaments base)
3. Maintain consistent naming pattern for logger service names

### Phase 3: Test Verification (1-2 hours)
1. Run full test suite
2. Verify all logger mock tests pass
3. Verify no regressions in other tests
4. Check for any remaining test failures

### Phase 4: Cleanup & Documentation (30 minutes)
1. Update any related documentation
2. Add comments explaining the pattern
3. Create linting rule if needed to prevent future module-level loggers

## Files to Modify

### Tournament Routes (30+ files)
- `src/app/api/tournaments/[id]/mr/route.ts`
- `src/app/api/tournaments/[id]/bm/route.ts`
- `src/app/api/tournaments/[id]/gp/route.ts`
- `src/app/api/tournaments/[id]/ta/route.ts`
- `src/app/api/tournaments/[id]/tt/route.ts`
- All sub-route files (finals, matches, standings, export, etc.)

### Other API Routes
- `src/app/api/monitor/polling-stats/route.ts`
- Any other routes with module-level loggers

## Implementation Pattern

### Before
```typescript
import { createLogger } from "@/lib/logger";

const logger = createLogger('mr-api');

export async function GET(request, { params }) {
  // ...
}
```

### After
```typescript
import { createLogger } from "@/lib/logger";

export async function GET(request, { params }) {
  const logger = createLogger('mr-api');

  // ...
}
```

### Multiple Handlers Pattern
For routes with multiple handlers (GET, POST, PUT, DELETE):

```typescript
export async function GET(request, { params }) {
  const logger = createLogger('mr-api-get');
  // ...
}

export async function POST(request, { params }) {
  const logger = createLogger('mr-api-post');
  // ...
}
```

## Testing Strategy

### Unit Tests
- Tests should continue using the same mock pattern
- No changes needed to test files
- Mocks will now work correctly because logger is created after mocks are set up

### Verification
```bash
# Run all API tests
npm test

# Run specific module tests
npm test -- --testPathPattern="tournaments.*mr"
npm test -- --testPathPattern="tournaments.*gp"
# etc.

# Check test coverage
npm test -- --coverage
```

## Risk Assessment

### Low Risk
- Pattern is simple and well-understood
- No breaking changes to API functionality
- Tests are already written, just need to pass

### Medium Risk
- Need to ensure consistent naming across all routes
- Must verify all routes are covered (don't miss any)

### Mitigation
- Use automated script to find all routes with module-level loggers
- Run tests after each batch of changes
- Peer review the changes

## Success Criteria

1. **All logger mock tests pass**: ~100+ tests currently failing due to logger issue
2. **Test pass rate improvement**: From ~53% to 80%+ (171/318 → 250+/318)
3. **No regressions**: All currently passing tests continue to pass
4. **No performance degradation**: API response times remain within acceptable limits
5. **Consistent pattern**: All routes follow the same logger creation pattern

## Estimated Timeline

| Phase | Duration | Owner |
|-------|----------|-------|
| Phase 1: Infrastructure | 30 min | - |
| Phase 2: Implementation | 3-4 hours | - |
| Phase 3: Testing | 1-2 hours | - |
| Phase 4: Documentation | 30 min | -|
| **Total** | **5-7 hours** | |

## Rollback Plan

If issues arise:
1. Revert all changes using git
2. Tests will return to current state (53% pass rate)
3. Alternative: Use Option B (jest.spyOn pattern) as fallback

## References

- Issue #124: https://github.com/azumag/JSMKC/issues/124
- Issue #121: Previous investigation of test expectation mismatches
- JEST_MOCK_FIX_PATTERN.md: Documentation of previous Jest mock fixes
