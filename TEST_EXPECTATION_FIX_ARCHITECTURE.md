# Test Expectation Mismatches - Technical Architecture & Specifications

## Issue #121: Fix test expectation mismatches across all tournament modules (GP, BM, MR, TA, TT)

**Created**: 2026-01-24  
**Status**: In Progress  
**Estimated Time**: 6-10 hours

---

## Executive Summary

Systematic test failures across all tournament mode modules due to expected value mismatches between test assertions and actual API behavior. Analysis reveals that most failures are caused by:

1. **Scoring logic bugs** in API routes
2. **Test expectations** that don't match actual business logic
3. **Inconsistent point calculation** across different API endpoints

---

## Root Cause Analysis

### Critical Discovery: GP Scoring System Bug

**Location**: `src/app/api/tournaments/[id]/gp/match/[matchId]/report/route.ts`

**Problem**: The `DRIVER_POINTS` array is in reverse order, causing incorrect point calculations.

**Current Code** (INCORRECT):
```typescript
const DRIVER_POINTS = [0, 1, 3, 6, 9];

function getPointsFromPosition(position: number): number {
  if (position < 1 || position > 4) return 0;
  return DRIVER_POINTS[position];
}

// Returns:
// Position 1: 1 point (WRONG - should be 9)
// Position 2: 3 points (WRONG - should be 6)
// Position 3: 6 points (WRONG - should be 3)
// Position 4: 9 points (WRONG - should be 1)
```

**Expected Behavior** (from other GP API route):
```typescript
// src/app/api/tournaments/[id]/gp/route.ts:11-12
const points1 = position1 === 1 ? 9 : position1 === 2 ? 6 : 0;
const points2 = position2 === 1 ? 9 : position2 === 2 ? 6 : 0;
```

**Correct Scoring System**:
- Position 1 (1st place): 9 points
- Position 2 (2nd place): 6 points
- Position 3 (3rd place): 3 points
- Position 4 (4th place): 1 point

### Test Failure Examples

#### Example 1: GP Match Report

**Test File**: `__tests__/app/api/tournaments/[id]/gp/match/[matchId]/report/route.test.ts`

**Test Input**:
```typescript
const races = [
  { course: 'Mario Circuit 1', position1: 1, position2: 2 },
  { course: 'Donut Plains 1', position1: 1, position2: 2 },
  { course: 'Ghost Valley 1', position1: 1, position2: 2 },
  { course: 'Bowser Castle 1', position1: 1, position2: 2 },
];
```

**Expected** (CORRECT):
```typescript
{
  player1ReportedPoints1: 36,  // 4 races × 9 points = 36
  player1ReportedPoints2: 24,  // 4 races × 6 points = 24
}
```

**Actual** (BUG - Wrong scoring):
```typescript
{
  player1ReportedPoints1: 4,   // 4 races × 1 point = 4
  player1ReportedPoints2: 12,  // 4 races × 3 points = 12
}
```

---

## Technical Specifications

### Phase 1: Fix GP Scoring System (CRITICAL)

**Priority**: HIGH  
**Affected Modules**: GP  
**Estimated Time**: 1 hour

#### Fix Required

**File**: `src/app/api/tournaments/[id]/gp/match/[matchId]/report/route.ts`

**Change**:
```typescript
// BEFORE (INCORRECT):
const DRIVER_POINTS = [0, 1, 3, 6, 9];

// AFTER (CORRECT):
const DRIVER_POINTS = [0, 9, 6, 3, 1];
```

**Impact**: This single fix will resolve ~40-50 GP test failures automatically.

**Validation**:
```typescript
// Test cases after fix:
getPointsFromPosition(1) === 9  // ✓ Position 1 = 9 points
getPointsFromPosition(2) === 6  // ✓ Position 2 = 6 points
getPointsFromPosition(3) === 3  // ✓ Position 3 = 3 points
getPointsFromPosition(4) === 1  // ✓ Position 4 = 1 point
```

### Phase 2: Analyze and Fix Other Modules

#### BM (Battle Mode) Module
**Test Files**: 10  
**Failing Tests**: 128  
**Passing Tests**: 69 (35% passing)

**Analysis Needed**:
1. Review BM scoring logic
2. Identify pattern of mismatches
3. Determine if it's a bug or test expectation issue

#### MR (Match Race) Module
**Test Files**: 10  
**Failing Tests**: 74  
**Passing Tests**: 67 (47.5% passing)

**Analysis Needed**:
1. Review MR scoring logic
2. Identify pattern of mismatches
3. Determine if it's a bug or test expectation issue

#### TT (Time Trials) Module
**Test Files**: 1  
**Failing Tests**: 14  
**Passing Tests**: 14 (50% passing)

**Analysis Needed**:
1. Review TT time calculation logic
2. Identify pattern of mismatches
3. Determine if it's a bug or test expectation issue

#### TA (Time Attack) Module
**Test Files**: TBD  
**Failing Tests**: TBD (timeout during execution)

**Analysis Needed**:
1. Review TA time calculation logic
2. Identify pattern of mismatches
3. Determine if it's a bug or test expectation issue

### Phase 3: Systematic Test Fix Strategy

#### Fix Categories

**Category A: Scoring Logic Bugs** (Fix API Code)
- GP: 49 tests affected
- BM: TBD tests affected
- MR: TBD tests affected
- TT: TBD tests affected
- TA: TBD tests affected

**Category B: Test Expectation Issues** (Fix Test Code)
- Tests expecting wrong data structure
- Tests expecting wrong business logic
- Tests with outdated expectations

**Category C: Mock Configuration Issues**
- Mock returns inconsistent with actual behavior
- Mock setup issues

#### Fix Decision Framework

For each failing test, determine:

1. **Is the API code correct?**
   - Check if behavior matches business requirements
   - Check if consistent with other similar endpoints
   - Check if documented in requirements

2. **If API is correct** → Update test expectations
3. **If API is wrong** → Fix API code
4. **If unclear** → Document and escalate

---

## Implementation Plan

### Step 1: Fix GP Scoring Bug (1 hour)
1. Update `DRIVER_POINTS` array in GP match report route
2. Run GP tests to verify fix
3. Document the fix

### Step 2: Analyze BM Module (1-2 hours)
1. Run BM tests with verbose output
2. Identify failure patterns
3. Review BM API code
4. Create fix plan for BM

### Step 3: Analyze MR Module (1-2 hours)
1. Run MR tests with verbose output
2. Identify failure patterns
3. Review MR API code
4. Create fix plan for MR

### Step 4: Analyze TT Module (1 hour)
1. Run TT tests with verbose output
2. Identify failure patterns
3. Review TT API code
4. Create fix plan for TT

### Step 5: Analyze TA Module (1-2 hours)
1. Run TA tests with verbose output (handle timeouts)
2. Identify failure patterns
3. Review TA API code
4. Create fix plan for TA

### Step 6: Implement Fixes (4-6 hours)
1. Apply fixes to API code (Category A)
2. Update test expectations (Category B)
3. Fix mock configurations (Category C)

### Step 7: Validation (1-2 hours)
1. Run full test suite
2. Verify all tests pass
3. Check for regressions
4. Update documentation

---

## Acceptance Criteria

- [ ] GP module: All 49 failing tests now pass
- [ ] BM module: All 128 failing tests now pass
- [ ] MR module: All 74 failing tests now pass
- [ ] TT module: All 14 failing tests now pass
- [ ] TA module: All failing tests now pass
- [ ] No regressions in currently passing tests
- [ ] All API routes use consistent scoring logic
- [ ] Documentation updated with any logic changes
- [ ] Code review approved

---

## Risk Assessment

### High Risk
- **GP Scoring Fix**: Fixing the `DRIVER_POINTS` array is critical and may affect production behavior
  - **Mitigation**: Verify with business requirements and test thoroughly

### Medium Risk
- **BM Module**: Large number of failing tests (128)
  - **Mitigation**: Systematic analysis before implementing fixes
- **MR Module**: Significant number of failing tests (74)
  - **Mitigation**: Systematic analysis before implementing fixes

### Low Risk
- **TT Module**: Smaller number of tests (28 total)
- **TA Module**: Timeouts may indicate performance issues

---

## Success Metrics

- **Test Pass Rate**: Target 100% for all modules
- **No Regressions**: 0 currently passing tests should fail
- **Code Quality**: No new ESLint errors or warnings
- **Performance**: Test execution time under 2 minutes for full suite

---

## Related Files

### API Routes (Potential Fixes)
- `src/app/api/tournaments/[id]/gp/match/[matchId]/report/route.ts` - **CONFIRMED BUG**
- `src/app/api/tournaments/[id]/bm/**/*.ts` - **TO BE ANALYZED**
- `src/app/api/tournaments/[id]/mr/**/*.ts` - **TO BE ANALYZED**
- `src/app/api/tournaments/[id]/tt/**/*.ts` - **TO BE ANALYZED**
- `src/app/api/tournaments/[id]/ta/**/*.ts` - **TO BE ANALYZED**

### Test Files (Potential Expectation Updates)
- `__tests__/app/api/tournaments/[id]/gp/**/*.test.ts` - 7 files
- `__tests__/app/api/tournaments/[id]/bm/**/*.test.ts` - 10 files
- `__tests__/app/api/tournaments/[id]/mr/**/*.test.ts` - 10 files
- `__tests__/app/api/tournaments/[id]/tt/**/*.test.ts` - 1 file
- `__tests__/app/api/tournaments/[id]/ta/**/*.test.ts` - TBD files

---

## Notes

1. **Critical Finding**: The GP scoring system bug is a clear API bug, not a test expectation issue. The test expectations are correct based on business logic.

2. **Consistency Check**: Other GP API routes use the correct scoring system (position 1 = 9 points, position 2 = 6 points), confirming the bug in the match report route.

3. **Business Logic**: The scoring system should reward better positions with more points (1st place gets the most points).

4. **Documentation**: No explicit scoring system documentation found in requirements.md, but the consistent pattern across GP routes confirms the intended behavior.

---

## Next Steps

1. **Immediate**: Fix the GP scoring bug
2. **Short-term**: Analyze BM, MR, TT, TA modules
3. **Medium-term**: Implement systematic fixes
4. **Long-term**: Add explicit scoring system documentation
