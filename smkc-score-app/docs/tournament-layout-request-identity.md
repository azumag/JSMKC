# Tournament layout request identity

The tournament detail layout is reused across `/tournaments/[id]/*` routes. A transition from one tournament id to another must therefore be treated as a hard client-state ownership boundary.

## Contract

`src/app/tournaments/[id]/layout.tsx` resolves the current tournament id in the outer layout and renders the stateful layout content with that id as its React `key`.

This gives the following behavior:

- Navigation between tabs of the same tournament keeps the same layout instance and preserves the existing summary/status state.
- Navigation to a different tournament remounts the stateful layout immediately. The new route starts from the loading state and never renders the previous tournament header or lifecycle status while its summary is loading.
- Retry timers and `publicModesChanged` listeners belong to the tournament instance that created them and are cleaned up when that instance unmounts.
- A summary request or status `PUT` started for tournament A may still complete at the transport/server layer after navigation to tournament B, but its React state setters belong to the unmounted A instance and cannot update B's UI or status-update lock.

The identity boundary is intentionally a UI/state-ownership guarantee, not a server-side cancellation guarantee. Do not assume that navigation rolls back or cancels a mutation that has already reached the server.

## Regression coverage

`__tests__/app/tournaments/tournament-layout-controls.test.tsx` covers:

- hiding tournament A immediately while tournament B summary is pending;
- ignoring a late tournament A summary after tournament B has loaded;
- ignoring a late tournament A status-update completion after navigation to tournament B;
- preserving the existing status-update and duplicate-submit behavior within one tournament.

If tournament-scoped layout state is added later, keep it inside the keyed stateful subtree unless there is an explicit reason for that state to survive a tournament-id change.
