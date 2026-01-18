# Task 2: Create Database Migration and Implement Optimistic Locking Utilities

## Objective
Generate database migration for version fields and implement core optimistic locking utilities according to ARCHITECTURE.md section 8.2.

## Files to Create/Modify
- **Migration**: Generate via `npx prisma migrate dev`
- `/Users/azumag/work/JSMKC/jsmkc-app/lib/optimistic-locking.ts` (new file)
- `/Users/azumag/work/JSMKC/jsmkc-app/lib/db.ts` (if needed for utilities)

## Part 1: Database Migration

### Migration Requirements:
1. Run migration generation: `npx prisma migrate dev --name add-optimistic-locking`
2. Verify migration includes version columns for all target models
3. Ensure default value of 0 is properly set
4. Test migration on development database

### Validation:
- [ ] Migration generated successfully
- [ ] All version columns are added with proper defaults
- [ ] No existing data is lost
- [ ] Migration can be rolled back if needed

## Part 2: Optimistic Locking Utilities

### Core Classes and Functions to Implement:

#### 1. OptimisticLockError Class
```typescript
export class OptimisticLockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OptimisticLockError'
  }
}
```

#### 2. updateWithRetry Function
```typescript
export async function updateWithRetry<T>(
  updateFn: (currentVersion: number) => Promise<T>,
  maxRetries: number = 3
): Promise<T>
```

#### 3. Update Helper Functions for Each Model Type
- `updateTournamentWithLock()`
- `updatePlayerWithLock()` 
- `updateMatchWithLock()` (generic for BM, MR, GP matches)
- `updateTTEntryWithLock()`

### Implementation Requirements:

#### 1. Exponential Backoff Logic:
- Base delay: 100ms
- Exponential increase: 100ms, 200ms, 400ms
- Maximum retries: 3 (configurable)

#### 2. Version Checking Pattern:
```typescript
const updatedRecord = await prisma.model.update({
  where: {
    id: modelId,
    version: expectedVersion // Critical: version in WHERE clause
  },
  data: {
    // update fields
    version: { increment: 1 }, // Critical: increment version
    updatedAt: new Date()
  }
})

if (!updatedRecord) {
  throw new OptimisticLockError('Record was updated by another user')
}
```

#### 3. Error Handling:
- Throw OptimisticLockError when version mismatch occurs
- Preserve original error messages
- Log retry attempts for debugging

### Critical Review Points:
- [ ] Is exponential backoff correctly implemented?
- [ ] Are version checks in WHERE clauses (not just data updates)?
- [ ] Is version increment atomic with the update?
- [ ] Are all model types covered with helper functions?
- [ ] Is error handling robust and informative?
- [ ] Are TypeScript types properly defined?

### Integration Requirements:
- Must work with existing Prisma client
- Compatible with Next.js API routes
- Support for concurrent update scenarios
- Proper error propagation for frontend handling

## Success Criteria:
1. Migration runs successfully and adds version columns
2. All utility functions compile without TypeScript errors
3. Unit tests pass for retry logic and version checking
4. Integration with existing Prisma setup works correctly

## Next Steps:
After this task, the next subagent will:
1. Update all API routes to use optimistic locking
2. Add proper error handling for version conflicts
3. Return appropriate HTTP status codes (409 Conflict)

## Testing Requirements:
- Test concurrent update scenarios
- Verify retry mechanism works correctly
- Confirm proper error throwing and handling