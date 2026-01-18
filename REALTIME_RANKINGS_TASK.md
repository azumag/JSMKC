# Task: Real-time Rankings Display Implementation

## Overview
Implement polling-based real-time rankings display for all game modes (Time Trial, Battle Mode, Match Race, Grand Prix) with the following requirements:

## Requirements

### 1. Polling Mechanism
- Poll every 3 seconds for data updates
- Stop polling when page is not visible (use Page Visibility API)
- Restart polling when page becomes visible again
- Clean up intervals on component unmount

### 2. Visual Indicators
- Show "Live Updating..." indicator when polling is active
- Show "Last updated: X seconds ago" timestamp
- Add subtle animation when data refreshes
- Highlight rows/elements that have been recently updated

### 3. Performance Optimization
- Only re-render when data actually changes
- Use React.memo or useMemo where appropriate
- Minimize unnecessary API calls

### 4. Mobile-Friendly Design
- Ensure responsive layout works well on mobile
- Hide unnecessary columns/elements on small screens
- Optimize touch targets

## Implementation Plan

### Step 1: Create Custom Hook
Create `src/lib/hooks/usePolling.ts`:
- Accept fetch function and interval (default 3000ms)
- Use Page Visibility API to detect visibility
- Return: data, loading, lastUpdated, isPolling status
- Handle cleanup on unmount

### Step 2: Create Update Indicator Component
Create `src/components/ui/update-indicator.tsx`:
- Show "Live" or "Paused" status
- Display last update time
- Animated pulse when updating

### Step 3: Update Time Attack Page
The Time Attack page already has basic polling (lines 131-137 in `ta/page.tsx`). Update it to:
- Use the new usePolling hook
- Add visual update indicator
- Optimize re-renders

### Step 4: Update Battle Mode Page
Update `src/app/tournaments/[id]/bm/page.tsx`:
- Add polling using usePolling hook
- Add visual update indicator
- Add animation to ranking updates

### Step 5: Update Match Race Pages
Update:
- `src/app/tournaments/[id]/mr/page.tsx`
- `src/app/tournaments/[id]/mr/finals/page.tsx`
- `src/app/tournaments/[id]/mr/match/[matchId]/page.tsx`

Add polling and visual indicators to all pages.

### Step 6: Update Grand Prix Pages
Update:
- `src/app/tournaments/[id]/gp/page.tsx`
- `src/app/tournaments/[id]/gp/finals/page.tsx`
- `src/app/tournaments/[id]/gp/match/[matchId]/page.tsx`

Add polling and visual indicators to all pages.

### Step 7: Add Recent Update Highlighting
Add CSS classes for:
- `.update-flash` - subtle flash animation when data updates
- `.recently-updated` - highlight recently changed rows
- Fade out highlight after a few seconds

## Technical Details

### Polling Hook API
```typescript
interface UsePollingOptions {
  fetchFn: () => Promise<void>;
  interval?: number; // default 3000ms
  enabled?: boolean; // default true
}

interface UsePollingReturn {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  isPolling: boolean;
  refetch: () => Promise<void>;
}
```

### Page Visibility API Usage
```typescript
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.hidden) {
      clearInterval(intervalRef);
      setIsPolling(false);
    } else {
      fetchData();
      startPolling();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, []);
```

### Data Change Detection
To avoid unnecessary re-renders:
- Compare JSON.stringify of old and new data
- Only update state if data has changed
- Use useRef to track previous data

## Testing Checklist
- [ ] Polling works every 3 seconds when page is visible
- [ ] Polling stops when tab is hidden
- [ ] Polling resumes when tab becomes visible
- [ ] No memory leaks (intervals properly cleaned up)
- [ ] Visual indicator shows correct status
- [ ] Data updates trigger visual flash effect
- [ ] Mobile layout works correctly
- [ ] No unnecessary re-renders when data hasn't changed

## Files to Create
1. `src/lib/hooks/usePolling.ts`
2. `src/components/ui/update-indicator.tsx`

## Files to Modify
1. `src/app/tournaments/[id]/ta/page.tsx` (refactor existing polling)
2. `src/app/tournaments/[id]/bm/page.tsx`
3. `src/app/tournaments/[id]/mr/page.tsx`
4. `src/app/tournaments/[id]/mr/finals/page.tsx`
5. `src/app/tournaments/[id]/mr/match/[matchId]/page.tsx`
6. `src/app/tournaments/[id]/gp/page.tsx`
7. `src/app/tournaments/[id]/gp/finals/page.tsx`
8. `src/app/tournaments/[id]/gp/match/[matchId]/page.tsx`
9. `src/app/globals.css` (add animation styles)
