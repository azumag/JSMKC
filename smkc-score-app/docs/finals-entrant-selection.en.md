# Finals Entrant Selection (2, 3, and 4 Groups)

Scope: the logic in `selectFinalsEntrantsByGroup()` (`src/lib/finals-group-selection.ts`) that picks finals entrants (direct advancers / barrage / eliminated) from the qualification groups.

**Current status**: both the UI and API support 2 and 3 groups (the group-count selector in `group-setup-dialog.tsx`, `qualification-route.ts`, and `TOP24_SUPPORTED_GROUP_COUNT` in `finals-route.ts`). The internal `selectFinalsEntrantsByGroup()` logic and its tests also cover 4 groups, but creating 4+ groups through the UI or API remains out of scope per the decision in `docs/qualification-combined-ranking.md` §7.

## 1. Shared framework

The total number of finals slots is always the fixed constant `TOTAL_FINALS_SLOTS = 12` (not derived from the participant count).

```
perGroup = 12 / group count

Each group's   1..perGroup            place → Direct advancement (Upper Bracket, 12 total)
Each group's (perGroup+1)..(2*perGroup) place → Barrage (survival tournament, 12 total)
Each group's (2*perGroup+1) place onward      → Eliminated
```

Every group needs at least `2 * perGroup` players (direct + barrage) — enforced by `selectFinalsEntrantsByGroup()`'s validation.

Note the distinction between "who qualifies for direct advancement vs. barrage" (selection) and "which specific bracket seed they're placed into" (the ordering that avoids same-group matchups, seed placement). 2 groups uses a fixed token map (§2.2); 3 groups uses a general algorithm, `assignAntiCollisionSeeds()` (§3.3). Both are implemented.

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

## 3. The 3-group case

`perGroup = 4`. Each group's places 1-4 advance directly (12 total), places 5-8 go to barrage (12 total), and 9th place onward is eliminated.

### 3.1 Selection (the bucket method)

With 3 groups, "who is direct vs. barrage" can no longer be decided per group in isolation — the 3 groups need to be merged into one cross-group ranking. Per `docs/qualification-combined-ranking.md` (confirmed by tournament operations), the "bucket" rule is used:

1. Take every group's "1st place" finisher and bundle them into one set — Bucket 1. Take every group's "2nd place" finisher into Bucket 2. And so on.
2. Buckets are an absolute priority order: **everyone in Bucket N always outranks everyone in Bucket N+1**, no matter how their individual stats compare.
3. Only the order _within_ a bucket is tie-broken, by **WDL score (match points) -> point differential**. When both are completely tied, the recorded cross-group sudden-death order in `combinedRankOverride` is used. **Neither seeding nor alphabetical group order is consulted**.

Since `perGroup = 4`, buckets 1-4 advance directly and buckets 5-8 go to barrage.

### 3.2 Concrete example

With 3 groups of 9+ players each (same numbers as the test case in `__tests__/lib/finals-group-selection.test.ts`), suppose Bucket 1 (each group's 1st-place finisher) has match points A1=5, B1=9, C1=7:

```
Bucket 1 order (by match points, descending): B1(9) -> C1(7) -> A1(5)
```

The order follows actual match points, not alphabetical group order. Unlike the 2-group case's fixed token map (§2.2), this order is **determined by that specific tournament's actual results** — the same group sizes can produce a different bucket order from one event to the next.

### 3.3 Seed placement (avoiding same-group matchups, a general algorithm)

For 3 groups, which specific bracket seed an entrant is placed into (the equivalent of §2.2's anti-collision placement) can't be a fixed token map the way it is for 2 groups — as §3.2 shows, a bucket's actual group makeup depends on that tournament's results, so there's no static "group A's Nth place always gets seed X" table to write. Instead this is handled by a general algorithm, `assignAntiCollisionSeeds()` (`finals-group-selection.ts`):

1. For both the 16-player finals bracket and the 12-player barrage/playoff bracket, derive which round-1 seeds are already paired against a _known_ opponent (i.e., two direct-advancer seeds whose groups we already know) versus which round-1 seeds face a _not-yet-determined_ opponent (a barrage survivor) — computed directly from the real bracket-generation logic (`generateBracketStructure`/`generatePlayoffStructure`), not a hardcoded copy, so it can't drift if the bracket structure changes.
2. The "opponent not yet known" seeds (ranks 1/3/5/7 for the direct bracket; the 4 BYE slots for barrage) go to the top-ranked entrants overall (by bucket, then tiebreak order).
3. For the seeds whose round-1 opponent is another entrant from this same batch, take the remaining entrants two at a time from the top of the ranking, pairing each with the next-best entrant **from a different group** — repeating down the ranking.
4. After barrage completes, Phase 2 knows all four winners' groups. `reseedDirectEntrantsAgainstPlayoffWinners()` then rearranges the same 12 direct advancers within the direct-seed set so that all eight Upper R1 matches are cross-group, including direct-vs-barrage-winner matches. The qualifying field itself does not change.

With 3 groups and at least 4 direct advancers per group, every bucket necessarily includes one entrant from all 3 groups, so this pairing step can always find a different-group partner (it can't fail).

### 3.4 Concrete example (finals seed placement)

With 3 groups of 9 players each, all tied on match points, `assignAntiCollisionSeeds()` places entrants like this:

```
Direct advancers (seed -> player):
  1:A1  2:B2  3:B1  4:A3  5:C1  6:C3
  7:A2  8:B4  9:C4  11:A4  13:B3  15:C2
```

Every round-1 pair with a known opponent (seeds 2/15, 4/13, 6/11, 8/9) is between different groups (B2/C2, A3/B3, C3/A4, B4/C4).

## 4. The 4-group case (internal logic)

`perGroup = 3`. Each group's places 1-3 advance directly (12 total), places 4-6 go to barrage (12 total), and 7th place onward is eliminated. Selection uses the same bucket method as the 3-group case: bundle equal group ranks, then order within each bucket by WDL score -> point differential. `assignAntiCollisionSeeds()` uses the same general algorithm to place known round-one pairs in different groups.

This remains covered by the existing logic and tests, but cannot currently be selected through the UI or API.

## 5. Comparison table

| | 2 groups (current) | 3 groups | 4 groups (internal logic) |
|---|---|---|
| perGroup | 6 | 4 | 3 |
| Direct-advancer selection | Each group's places 1-6 (group-internal rank as-is) | Buckets 1-4 (each group's Nth place, stacked and tie-broken by match points -> point differential) | Buckets 1-3 |
| Barrage selection | Each group's places 7-12 | Buckets 5-8 | Buckets 4-6 |
| Cross-group comparison needed? | No | Yes (within-bucket tiebreak by match points -> point differential) | Yes (same) |
| Seed placement (avoiding same-group matchups) | Handwritten fixed token map | General algorithm (`assignAntiCollisionSeeds()`) | General algorithm (same) |
| Usable from the UI? | Yes | Yes | No |

## 6. Out of scope / known limitations

- **4+ groups through the UI/API**: out of scope per the decision in `docs/qualification-combined-ranking.md` §7. The existing 4-group internal logic remains, but it is unreachable from the UI (`group-setup-dialog.tsx`) or API (`qualification-route.ts`, `finals-route.ts`). Five or more groups are outside the internal logic's scope as well.
- **The CDM Excel template's own formulas**: `cdm-2025-template.xlsm`'s `SORTBY` formula was not changed (§7 Q6 of that same doc). The app's combined-ranking/finals-selection logic and the CDM Excel template's display may disagree for a period.

## 7. Related files

- Implementation: `src/lib/finals-group-selection.ts`
- Tests: `__tests__/lib/finals-group-selection.test.ts`
- Combined-ranking (bucket method) spec: `docs/qualification-combined-ranking.md`
