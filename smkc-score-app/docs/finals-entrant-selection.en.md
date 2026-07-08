# Finals Entrant Selection (2-Group vs. 3-Group)

Scope: the logic in `selectFinalsEntrantsByGroup()` (`src/lib/finals-group-selection.ts`) that picks finals entrants (direct advancers / barrage / eliminated) from the qualification groups.

**Current status**: group count is still locked to 2 in the UI and API (`LOCKED_GROUP_COUNT = 2` in `group-setup-dialog.tsx`). The "3-group case" described here is implemented and tested in code, but a 3-group tournament cannot yet be created from the UI (separate UI/API unlock work is still needed — see §5).

## 1. Shared framework

The total number of finals slots is always the fixed constant `TOTAL_FINALS_SLOTS = 12` (not derived from the participant count).

```
perGroup = 12 / group count

Each group's   1..perGroup            place → Direct advancement (Upper Bracket, 12 total)
Each group's (perGroup+1)..(2*perGroup) place → Barrage (survival tournament, 12 total)
Each group's (2*perGroup+1) place onward      → Eliminated
```

Every group needs at least `2 * perGroup` players (direct + barrage) — enforced by `selectFinalsEntrantsByGroup()`'s validation.

Note the distinction between "who qualifies for direct advancement vs. barrage" (the subject of this document) and "which specific bracket seed they're placed into" (the ordering that avoids same-group matchups). The latter is currently only designed for the 2-group case (§2.2).

## 2. The 2-group case (current production)

`perGroup = 6`. 12 direct advancers + 12 barrage entrants (4 of whom advance through barrage) make up the finals Top 16.

### 2.1 Selection

For 2 groups, "who is direct vs. barrage" is decided purely by **each group's own internal rank** — no cross-group comparison is needed. Group A's places 1-6 and group B's places 1-6 advance directly; places 7-12 in each group go to barrage. That's it.

### 2.2 Seed placement (avoiding same-group matchups)

For 2 groups, there's an additional step: which specific Upper Bracket seed number each of the 12 direct advancers gets is also fixed, via a handwritten token map (`TWO_GROUP_DIRECT_UPPER_SEEDS` / `TWO_GROUP_BARRAGE_SEED_TOKENS`). This was designed by hand specifically to avoid same-group matchups in the early rounds.

Example (group A = 14 players, group B = 13 players):

```
Direct advancers (seed -> player):
  1:A1  2:B3  3:B1  4:A3  5:B2  6:A4
  7:A2  8:B4  9:A5  11:B5  13:B6  15:A6

Barrage (playoff seeds 1-12):
  B8, B7, A8, A7, B9, A11, B10, A12, A10, B12, A9, B11
```

The 16-player bracket's Upper R1 (round 1) matches, top to bottom:

```
A1 vs barrage    B4 vs A5
B2 vs barrage    A3 vs B6
B1 vs barrage    A4 vs B5
A2 vs barrage    B3 vs A6
```

This seed placement never looks at any stats (WDL score, point differential, etc.) — it's a fixed pattern based purely on group-internal rank position.

## 3. The 3-group case (implemented, not yet unlocked)

`perGroup = 4`. Each group's places 1-4 advance directly (12 total), places 5-8 go to barrage (12 total), and 9th place onward is eliminated.

### 3.1 Selection (the bucket method)

With 3 groups, "who is direct vs. barrage" can no longer be decided per group in isolation — the 3 groups need to be merged into one cross-group ranking. Per `docs/qualification-combined-ranking.md` (confirmed by tournament operations), the "bucket" rule is used:

1. Take every group's "1st place" finisher and bundle them into one set — Bucket 1. Take every group's "2nd place" finisher into Bucket 2. And so on.
2. Buckets are an absolute priority order: **everyone in Bucket N always outranks everyone in Bucket N+1**, no matter how their individual stats compare.
3. Only the order *within* a bucket is tie-broken, by **WDL score (match points) -> point differential**. **Seeding is never consulted** (tournament operations decided against it).

Since `perGroup = 4`, buckets 1-4 advance directly and buckets 5-8 go to barrage.

### 3.2 Concrete example

With 3 groups of 9+ players each (same numbers as the test case in `__tests__/lib/finals-group-selection.test.ts`), suppose Bucket 1 (each group's 1st-place finisher) has match points A1=5, B1=9, C1=7:

```
Bucket 1 order (by match points, descending): B1(9) -> C1(7) -> A1(5)
```

The order follows actual match points, not alphabetical group order. Unlike the 2-group case's fixed token map (§2.2), this order is **determined by that specific tournament's actual results** — the same group sizes can produce a different bucket order from one event to the next.

### 3.3 Seed placement is not yet designed (known limitation)

For 3 groups, *selecting* who advances directly vs. via barrage (§3.1) is implemented, but *which specific bracket seed* each entrant is placed into (the 3-group equivalent of §2.2's anti-collision placement) has not been designed yet. Today, seeds are simply numbered sequentially in bucket order (all of bucket 1 sorted by match points, then all of bucket 2, and so on) with no attempt to avoid same-group matchups. This is left as a separate follow-up task.

## 4. Comparison table

| | 2 groups (current) | 3 groups (implemented, not unlocked) |
|---|---|---|
| perGroup | 6 | 4 |
| Direct-advancer selection | Each group's places 1-6 (group-internal rank as-is) | Buckets 1-4 (each group's Nth place, stacked and tie-broken by match points -> point differential) |
| Barrage selection | Each group's places 7-12 | Buckets 5-8 |
| Cross-group comparison needed? | No | Yes (within-bucket tiebreak by WDL score -> point differential) |
| Seed placement (avoiding same-group matchups) | Handwritten fixed token map | Not designed yet (seeded sequentially in bucket order) |
| Usable from the UI today? | Yes (current production) | No (`LOCKED_GROUP_COUNT=2` blocks creation) |

## 5. Remaining work to actually enable 3 groups

- UI: unlock `LOCKED_GROUP_COUNT = 2` in `src/components/tournament/group-setup-dialog.tsx`
- API: remove the group-A/B-only validation in `src/lib/api-factories/qualification-route.ts`
- Finals bracket seed placement (§3.3): design the same-group-matchup-avoidance ordering
- The still-open items in `docs/qualification-combined-ranking.md` §7 (root cause of the PDF discrepancies, support for 4+ groups, and the alignment policy between the app and the CDM Excel template's own formulas)

## 6. Related files

- Implementation: `src/lib/finals-group-selection.ts`
- Tests: `__tests__/lib/finals-group-selection.test.ts`
- Combined-ranking (bucket method) spec: `docs/qualification-combined-ranking.md`
