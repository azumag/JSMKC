# Task 3: Update API Routes with Optimistic Locking

## Objective
Modify all API routes to implement optimistic locking with version checking and proper conflict responses according to ARCHITECTURE.md section 8.2.

## API Routes to Update

### Tournament Management:
- `/api/tournaments/[id]/route.ts` (PUT)
- `/api/tournaments/[id]/ta/route.ts` (PUT/PATCH)

### Player Management:
- `/api/players/[id]/route.ts` (PUT/PATCH)

### Battle Mode (BM):
- `/api/tournaments/[id]/bm/match/[matchId]/route.ts` (PUT)
- `/api/tournaments/[id]/bm/match/[matchId]/report/route.ts` (POST)
- `/api/tournaments/[id]/bm/finals/route.ts` (PUT/PATCH)

### Match Race (MR):
- `/api/tournaments/[id]/mr/match/[matchId]/route.ts` (PUT)
- `/api/tournaments/[id]/mr/match/[matchId]/report/route.ts` (POST)
- `/api/tournaments/[id]/mr/finals/route.ts` (PUT/PATCH)

### Grand Prix (GP):
- `/api/tournaments/[id]/gp/match/[matchId]/route.ts` (PUT)
- `/api/tournaments/[id]/gp/match/[matchId]/report/route.ts` (POST)
- `/api/tournaments/[id]/gp/finals/route.ts` (PUT/PATCH)

### Time Trial (TT):
- `/api/tournaments/[id]/ta/route.ts` (PUT/PATCH) - for TTEntry updates

## Implementation Requirements

### 1. Request Body Updates:
All update endpoints must accept `expectedVersion` parameter:

```typescript
interface UpdateRequest {
  // existing fields...
  expectedVersion: number; // New required field
}
```

### 2. Response Format Updates:
Success response (keep existing format):
```json
{
  "success": true,
  "data": { /* updated record */ }
}
```

Conflict response (new):
```json
{
  "success": false,
  "error": "This record was updated by someone else. Please refresh and try again.",
  "requiresRefresh": true,
  "currentVersion": 5 // Optional: latest version if available
}
```

### 3. Error Handling Pattern:
```typescript
export async function PUT(
  request: Request,
  { params }: { params: { id: string; matchId: string } }
) {
  const session = await auth()
  const body = await request.json()
  
  try {
    const updatedRecord = await updateMatchWithLock({
      matchId: params.matchId,
      updateData: {
        score1: body.score1,
        score2: body.score2,
        // other fields...
      },
      expectedVersion: body.expectedVersion
    })
    
    // Audit logging (if applicable)
    await createAuditLog({
      userId: session?.user?.id,
      action: 'UPDATE_MATCH',
      targetId: updatedRecord.id,
      targetType: 'Match',
      details: { /* change details */ }
    })
    
    return Response.json({ success: true, data: updatedRecord })
  } catch (error) {
    if (error instanceof OptimisticLockError) {
      return Response.json({
        success: false,
        error: 'This match was updated by someone else. Please refresh and try again.',
        requiresRefresh: true
      }, { status: 409 })
    }
    
    console.error('Update failed:', error)
    return Response.json({
      success: false,
      error: 'Failed to update record'
    }, { status: 500 })
  }
}
```

### 4. Specific Implementation by Route Type:

#### Match Update Routes (BM, MR, GP):
- Use `updateMatchWithLock()` utility
- Validate match belongs to specified tournament
- Check tournament status allows updates

#### Tournament Routes:
- Use `updateTournamentWithLock()` utility
- Validate admin permissions
- Check for active matches that might be affected

#### Player Routes:
- Use `updatePlayerWithLock()` utility
- Check for active tournament participations
- Handle soft delete considerations

#### Report Routes (Player Self-Reporting):
- Implement optimistic locking for player-reported scores
- Handle concurrent reporting scenarios
- Validate both players' reports

### 5. Critical Review Points:
- [ ] Are all update endpoints covered?
- [ ] Is `expectedVersion` properly validated?
- [ ] Are 409 Conflict responses consistent?
- [ ] Is audit logging preserved?
- [ ] Are permissions properly checked?
- [ ] Are error messages user-friendly?
- [ ] Is TypeScript typing correct?

### 6. Import Requirements:
Each route file must import:
```typescript
import { OptimisticLockError, updateMatchWithLock, updateTournamentWithLock, updatePlayerWithLock } from '@/lib/optimistic-locking'
```

### 7. Backward Compatibility:
- Existing clients should continue working (version 0 for existing records)
- Gradual migration approach for frontend updates
- Clear error messages guide users to refresh

## Validation Requirements:

### 1. Functional Testing:
- Test concurrent update scenarios
- Verify version conflicts return 409 status
- Confirm successful updates increment version
- Check audit logging still works

### 2. Error Testing:
- Simulate version mismatches
- Test invalid version numbers
- Verify error response format

### 3. Performance Testing:
- Ensure no significant performance degradation
- Confirm retry logic doesn't cause delays

## Success Criteria:
1. All update endpoints implement optimistic locking
2. Version conflicts return proper 409 responses
3. Existing functionality remains intact
4. Audit logging continues to work
5. TypeScript compilation succeeds

## Next Steps:
After this task, the next subagent will:
1. Update frontend forms to handle version conflicts
2. Implement conflict resolution UI
3. Add optimistic UI updates with rollback capability

## Notes:
- Focus on PUT/PATCH endpoints that modify data
- GET endpoints don't need optimistic locking
- Maintain existing authentication and authorization logic
- Preserve all existing error handling patterns