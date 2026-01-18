# Task 5: Verification Testing and System Integration

## Objective
Create comprehensive tests to verify optimistic locking functionality and ensure the complete system works correctly under concurrent access scenarios.

## Testing Scope

### 1. Database Layer Testing
- Migration integrity verification
- Version field functionality
- Concurrent update scenarios

### 2. API Layer Testing  
- Optimistic lock error handling
- HTTP status code verification
- Version conflict detection

### 3. Frontend Testing
- Conflict resolution UI
- Optimistic update rollback
- User interaction flows

### 4. End-to-End Testing
- Complete concurrent edit scenarios
- Multi-user simulation
- Data integrity verification

## Test Files to Create

### 1. Database Tests
`/tests/optimistic-locking-db.test.ts`
```typescript
describe('Optimistic Locking - Database Layer', () => {
  test('should increment version on successful update')
  test('should reject update when version mismatched')
  test('should handle concurrent updates correctly')
  test('should maintain data consistency under load')
})
```

### 2. API Tests
`/tests/api/optimistic-locking-api.test.ts`
```typescript
describe('Optimistic Locking - API Layer', () => {
  test('PUT /api/matches/:id should accept expectedVersion')
  test('should return 409 Conflict on version mismatch')
  test('should include requiresRefresh flag in error response')
  test('should handle retry mechanism correctly')
})
```

### 3. Frontend Tests
`/tests/components/optimistic-updates.test.tsx`
```typescript
describe('Optimistic Updates - Frontend', () => {
  test('should show optimistic UI updates immediately')
  test('should display conflict alert on version mismatch')
  test('should rollback changes on conflict discard')
  test('should refresh data on conflict resolution')
})
```

### 4. Integration Tests
`/tests/e2e/concurrent-edits.test.ts`
```typescript
describe('Concurrent Edit Scenarios', () => {
  test('two users editing same match simultaneously')
  test('multiple score updates in rapid succession')
  test('tournament status changes during match updates')
  test('player management during active tournament')
})
```

## Test Implementation Details

### 1. Database Layer Tests

#### Version Increment Test:
```typescript
test('should increment version on successful update', async () => {
  const tournament = await createTestTournament()
  const initialVersion = tournament.version
  
  await updateTournamentWithLock({
    tournamentId: tournament.id,
    updateData: { name: 'Updated Name' },
    expectedVersion: initialVersion
  })
  
  const updated = await prisma.tournament.findUnique({
    where: { id: tournament.id }
  })
  
  expect(updated.version).toBe(initialVersion + 1)
  expect(updated.name).toBe('Updated Name')
})
```

#### Concurrent Update Test:
```typescript
test('should handle concurrent updates correctly', async () => {
  const match = await createTestMatch()
  const initialVersion = match.version
  
  // Simulate two concurrent updates
  const update1 = updateMatchWithLock({
    matchId: match.id,
    updateData: { score1: 3 },
    expectedVersion: initialVersion
  })
  
  const update2 = updateMatchWithLock({
    matchId: match.id,
    updateData: { score2: 2 },
    expectedVersion: initialVersion
  })
  
  // One should succeed, one should fail
  const results = await Promise.allSettled([update1, update2])
  
  const successes = results.filter(r => r.status === 'fulfilled')
  const failures = results.filter(r => r.status === 'rejected')
  
  expect(successes).toHaveLength(1)
  expect(failures).toHaveLength(1)
  expect(failures[0].reason).toBeInstanceOf(OptimisticLockError)
})
```

### 2. API Layer Tests

#### Version Conflict Test:
```typescript
test('should return 409 Conflict on version mismatch', async () => {
  const match = await createTestMatch()
  
  const response = await PUT(
    new Request('http://localhost:3000/api/tournaments/test/match/123', {
      method: 'PUT',
      body: JSON.stringify({
        score1: 3,
        score2: 1,
        expectedVersion: 999 // Wrong version
      })
    }),
    { params: { id: 'test', matchId: '123' } }
  )
  
  expect(response.status).toBe(409)
  const body = await response.json()
  expect(body.success).toBe(false)
  expect(body.requiresRefresh).toBe(true)
})
```

### 3. Frontend Tests

#### Optimistic Update Test:
```typescript
test('should show optimistic UI updates immediately', async () => {
  const mockMatch = createMockMatch()
  
  const { result } = renderHook(() => useOptimisticUpdate(mockMatch))
  
  act(() => {
    result.current.updateOptimistically(async () => {
      // Simulate successful update
      await new Promise(resolve => setTimeout(resolve, 100))
      return { ...mockMatch, score1: 3 }
    })
  })
  
  expect(result.current.state.optimisticData?.score1).toBe(3)
  expect(result.current.state.isUpdating).toBe(true)
})
```

#### Conflict Resolution Test:
```typescript
test('should display conflict alert on version mismatch', async () => {
  const mockMatch = createMockMatch()
  
  const { getByText, queryByRole } = render(
    <MatchScoreForm match={mockMatch} />
  )
  
  // Simulate conflict
  fireEvent.change(screen.getByLabelText('Player 1 Score'), {
    target: { value: '3' }
  })
  fireEvent.click(screen.getByText('Update Score'))
  
  // Simulate version conflict response
  await waitFor(() => {
    expect(getByText('Concurrent Update Detected')).toBeInTheDocument()
    expect(getByText('Refresh and Continue')).toBeInTheDocument()
  })
})
```

### 4. End-to-End Tests

#### Multi-User Simulation:
```typescript
test('two users editing same match simultaneously', async () => {
  const page1 = await browser.newPage()
  const page2 = await browser.newPage()
  
  // Both users navigate to same match
  await page1.goto('/tournament/test/match/123')
  await page2.goto('/tournament/test/match/123')
  
  // User 1 updates score
  await page1.fill('[data-testid="score1"]', '3')
  await page1.click('[data-testid="update-button"]')
  
  // User 2 tries different score (should trigger conflict)
  await page2.fill('[data-testid="score2"]', '2')
  await page2.click('[data-testid="update-button"]')
  
  // User 2 should see conflict resolution
  await expect(page2.locator('[data-testid="conflict-alert"]')).toBeVisible()
  
  // User 2 resolves conflict
  await page2.click('[data-testid="refresh-button"]')
  
  // Verify final state
  const finalScore1 = await page1.inputValue('[data-testid="score1"]')
  const finalScore2 = await page2.inputValue('[data-testid="score2"]')
  
  expect(finalScore1).toBe('3') // User 1's update succeeded
  expect(finalScore2).toBe('0') // User 2's update was discarded
})
```

## Performance Testing

### Load Testing Script:
```typescript
describe('Performance Under Load', () => {
  test('should handle 50 concurrent match updates', async () => {
    const matches = await createTestMatches(50)
    const concurrentUpdates = matches.map(match => 
      updateMatchWithLock({
        matchId: match.id,
        updateData: { score1: Math.floor(Math.random() * 5) },
        expectedVersion: match.version
      })
    )
    
    const results = await Promise.allSettled(concurrentUpdates)
    
    const successRate = results.filter(r => r.status === 'fulfilled').length / results.length
    expect(successRate).toBeGreaterThan(0.8) // At least 80% should succeed
    
    // Verify data consistency
    const finalMatches = await prisma.bMMatch.findMany({
      where: { id: { in: matches.map(m => m.id) } }
    })
    
    finalMatches.forEach(match => {
      expect(match.version).toBeGreaterThan(0)
      expect(typeof match.score1).toBe('number')
    })
  })
})
```

## Manual Testing Scenarios

### 1. Real-Time Conflict Testing:
- Open same match in two browser windows
- Update scores simultaneously
- Verify conflict resolution workflow

### 2. Network Condition Testing:
- Test with slow network connections
- Simulate interrupted requests
- Verify retry mechanism functionality

### 3. Edge Case Testing:
- Test with invalid version numbers
- Test with malformed request bodies
- Test during database maintenance windows

## Validation Requirements

### 1. Functional Validation:
- [ ] All tests pass successfully
- [ ] Concurrent updates handled correctly
- [ ] Data integrity maintained
- [ ] Version conflicts properly detected

### 2. Performance Validation:
- [ ] No significant performance degradation
- [ ] Response times remain within acceptable limits
- [ ] Database query efficiency maintained

### 3. User Experience Validation:
- [ ] Conflict resolution is intuitive
- [ ] Loading states provide good feedback
- [ ] Error messages are helpful and clear

### 4. Security Validation:
- [ ] No unauthorized data access
- [ ] Version checking cannot be bypassed
- [ ] Audit trail maintained

## Success Criteria

### Complete Success:
1. All automated tests pass (≥95% coverage)
2. Manual testing scenarios all work correctly
3. Performance benchmarks met
4. No security vulnerabilities identified
5. User acceptance testing successful

### Partial Success (with workarounds):
1. Core functionality works but some edge cases fail
2. Performance degradation within acceptable limits
3. Workarounds identified for remaining issues

## Final Deliverables

### 1. Test Suite:
- Complete automated test coverage
- Performance benchmarks
- Manual testing procedures

### 2. Documentation:
- Test execution guide
- Troubleshooting procedures
- Performance optimization recommendations

### 3. Sign-off:
- QA approval checklist
- Security review completion
- Performance validation report

## Next Steps

After successful testing completion:

1. **Deployment**: Deploy to staging environment for final validation
2. **Monitoring**: Set up monitoring for optimistic locking performance
3. **Training**: Document new conflict resolution procedures for users
4. **Maintenance**: Create maintenance procedures for ongoing monitoring

This comprehensive testing approach ensures the optimistic locking system works correctly under all realistic usage scenarios while maintaining data integrity and providing a good user experience.