# Task 4: Frontend Conflict Handling and UI Updates

## Objective
Implement frontend optimistic UI updates with conflict resolution for all score entry forms according to ARCHITECTURE.md section 8.2.

## Components to Update

### Match Score Forms:
- Battle Mode match score forms
- Match Race match score forms  
- Grand Prix match score forms
- Time Trial time entry forms

### Tournament Management:
- Tournament edit forms
- Player management forms

## Implementation Requirements

### 1. State Management for Optimistic Updates:

#### Hook: `useOptimisticUpdate`
```typescript
interface OptimisticUpdateState<T> {
  data: T
  isUpdating: boolean
  conflict: boolean
  optimisticData: T | null
}

function useOptimisticUpdate<T>(initialData: T) {
  const [state, setState] = useState<OptimisticUpdateState<T>>({
    data: initialData,
    isUpdating: false,
    conflict: false,
    optimisticData: null
  })
  
  const updateOptimistically = async (updateFn: () => Promise<T>) => {
    // Implementation...
  }
  
  const resolveConflict = async () => {
    // Implementation...
  }
  
  return { state, updateOptimistically, resolveConflict }
}
```

### 2. Conflict Resolution UI Components:

#### Conflict Alert Component:
```typescript
interface ConflictAlertProps {
  onResolve: () => void
  onDiscard: () => void
  entityName: string
}

export function ConflictAlert({ onResolve, onDiscard, entityName }: ConflictAlertProps) {
  return (
    <div className="alert alert-warning" role="alert">
      <div className="flex items-center">
        <AlertTriangle className="h-5 w-5 mr-2" />
        <div>
          <p className="font-medium">Concurrent Update Detected</p>
          <p className="text-sm">
            Someone else updated this {entityName} while you were editing.
          </p>
          <div className="mt-3 space-x-2">
            <button 
              onClick={onResolve}
              className="btn btn-primary btn-sm"
            >
              Refresh and Continue
            </button>
            <button 
              onClick={onDiscard}
              className="btn btn-secondary btn-sm"
            >
              Discard My Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

### 3. Form Integration Pattern:

#### Enhanced Match Score Form:
```typescript
export function MatchScoreForm({ match }: { match: Match }) {
  const { 
    state, 
    updateOptimistically, 
    resolveConflict 
  } = useOptimisticUpdate(match)
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    await updateOptimistically(async () => {
      const response = await fetch(`/api/tournaments/${match.tournamentId}/bm/match/${match.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score1: state.optimisticData?.score1 || state.data.score1,
          score2: state.optimisticData?.score2 || state.data.score2,
          completed: true,
          expectedVersion: state.data.version
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        if (error.requiresRefresh) {
          throw new OptimisticLockError(error.error)
        }
        throw new Error(error.error)
      }
      
      return response.json()
    })
  }
  
  const handleInputChange = (field: 'score1' | 'score2', value: number) => {
    setState(prev => ({
      ...prev,
      optimisticData: {
        ...prev.optimisticData || prev.data,
        [field]: value
      }
    }))
  }
  
  return (
    <>
      {state.conflict && (
        <ConflictAlert
          onResolve={resolveConflict}
          onDiscard={() => setState(prev => ({ ...prev, conflict: false, optimisticData: null }))}
          entityName="match"
        />
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Player 1 Score
            </label>
            <input
              type="number"
              min="0"
              max="99"
              value={state.optimisticData?.score1 ?? state.data.score1}
              onChange={(e) => handleInputChange('score1', parseInt(e.target.value))}
              className="input input-bordered w-full"
              disabled={state.isUpdating}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">
              Player 2 Score
            </label>
            <input
              type="number"
              min="0"
              max="99"
              value={state.optimisticData?.score2 ?? state.data.score2}
              onChange={(e) => handleInputChange('score2', parseInt(e.target.value))}
              className="input input-bordered w-full"
              disabled={state.isUpdating}
            />
          </div>
        </div>
        
        <button 
          type="submit" 
          className="btn btn-primary mt-4"
          disabled={state.isUpdating}
        >
          {state.isUpdating ? (
            <><LoadingSpinner className="mr-2" /> Updating...</>
          ) : (
            'Update Score'
          )}
        </button>
      </form>
    </>
  )
}
```

### 4. Real-time Updates (Optional Enhancement):

#### WebSocket Integration for Live Updates:
```typescript
export function useRealtimeUpdates(tournamentId: string) {
  const [updates, setUpdates] = useState<UpdateEvent[]>([])
  
  useEffect(() => {
    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL}/tournament/${tournamentId}`)
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'MATCH_UPDATED') {
        setUpdates(prev => [...prev, data])
      }
    }
    
    return () => ws.close()
  }, [tournamentId])
  
  return updates
}
```

### 5. Loading and Progress Indicators:

#### Optimistic Update States:
- **Normal**: Standard form appearance
- **Optimistic**: Subtle highlight to show pending changes
- **Updating**: Loading spinner and disabled inputs
- **Conflict**: Warning alert with resolution options

### 6. Form-Specific Implementations:

#### Battle Mode Score Form:
- Handle best-of-7 scoring (0-4)
- Arena selection per round
- Winner determination logic

#### Match Race Score Form:
- Course-based race results
- Point calculation based on position
- Multiple race handling

#### Grand Prix Score Form:
- Driver points input
- Race-by-race position tracking
- Cup total calculations

#### Time Trial Form:
- Time input validation (MM:SS.ms format)
- Automatic total time calculation
- Course ranking updates

## Critical Review Points:
- [ ] Are optimistic updates properly implemented?
- [ ] Is conflict resolution UI user-friendly?
- [ ] Are loading states clearly indicated?
- [ ] Is rollback functionality working?
- [ ] Are all form types covered?
- [ ] Is accessibility maintained (ARIA labels, keyboard navigation)?
- [ ] Are mobile considerations addressed?

## Implementation Files:

### New Files to Create:
- `/hooks/useOptimisticUpdate.ts`
- `/components/ui/ConflictAlert.tsx`
- `/components/ui/LoadingSpinner.tsx`

### Files to Update:
- All match score form components
- Tournament management forms
- Player management components

## Testing Requirements:

### 1. Unit Testing:
- Test optimistic update hook
- Test conflict resolution logic
- Test form state management

### 2. Integration Testing:
- Test concurrent update scenarios
- Verify rollback functionality
- Test error boundary handling

### 3. User Experience Testing:
- Test conflict resolution flow
- Verify loading states
- Test mobile responsiveness

## Success Criteria:
1. Users see immediate feedback for their changes
2. Conflicts are clearly presented with resolution options
3. Data integrity is maintained during concurrent updates
4. User experience remains smooth and intuitive
5. All existing form functionality is preserved

## Next Steps:
After this task, the final subagent will:
1. Create comprehensive verification tests
2. Test concurrent edit scenarios
3. Verify the complete system integration
4. Create documentation for the optimistic locking system