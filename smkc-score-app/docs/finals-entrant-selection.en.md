# Finals Entrant Selection (2, 3, and 4 Groups)

Scope: the logic in `selectFinalsEntrantsByGroup()` (`src/lib/finals-group-selection.ts`) that picks finals entrants (direct advancers / barrage / eliminated) from the qualification groups and assigns them finals bracket seed numbers (1-24).

**Current status**: both the UI and API support 2 and 3 groups (the group-count selector in `group-setup-dialog.tsx`, `qualification-route.ts`, and `TOP24_SUPPORTED_GROUP_COUNT` in `finals-route.ts`). The internal `selectFinalsEntrantsByGroup()` logic and its tests also cover 4 groups, but creating 4+ groups through the UI or API remains out of scope per the decision in `docs/qualification-combined-ranking.md` §7.

**Revision history**: this document originally described a design where entrant selection was unified across group counts, but seed placement (avoiding same-group matchups) was handled differently per group count — a handwritten token map for 2 groups, and a general algorithm, `assignAntiCollisionSeeds()`, for 3+ groups. After verifying against the official CDM 2025 results workbook (the user-provided record of the actual real-world event), it turned out the real CDM 2025 finals bracket never avoided same-group matchups at all — same-group round-1 matches do occur in the real data — and seed placement is nothing more than "take the order selection already produced (bucket order, then tiebreak order) and number it 1-24 in sequence." The 2-group token map and `assignAntiCollisionSeeds()` have both been removed accordingly, and seed placement is now unified across all group counts as described below.

## 1. Shared framework

The total number of finals slots is always the fixed constant `TOTAL_FINALS_SLOTS = 12` (not derived from the participant count).

```
perGroup = 12 / group count

Each group's   1..perGroup            place → Direct advancement (Upper Bracket, 12 total)
Each group's (perGroup+1)..(2*perGroup) place → Barrage (survival tournament, 12 total)
Each group's (2*perGroup+1) place onward      → Eliminated
```

Every group needs at least `2 * perGroup` players (direct + barrage) — enforced by `selectFinalsEntrantsByGroup()`'s validation.

"Who qualifies for direct advancement vs. barrage" (selection) and "which specific bracket seed they're placed into" (seed placement) are, as described below, **determined by the same bucket result, numbered straight through**. There is no special reordering to avoid same-group matchups, for any group count — the real CDM 2025 event had same-group matchups too.

## 2. Selection (the bucket method, shared across 2-4 groups)

For 2 groups, each group's own internal rank happens to coincide with the bucket method's result, since there's no cross-group merge needed. For 3 and 4 groups, the groups must be merged into one cross-group ranking. Per `docs/qualification-combined-ranking.md` (confirmed by tournament operations), the same "bucket" rule applies regardless of group count:

1. Take every group's "1st place" finisher and bundle them into one set — Bucket 1. Take every group's "2nd place" finisher into Bucket 2. And so on.
2. Buckets are an absolute priority order: **everyone in Bucket N always outranks everyone in Bucket N+1**, no matter how their individual stats compare.
3. Only the order _within_ a bucket is tie-broken, by **WDL score (match points) -> point differential**. When both are completely tied, the recorded cross-group sudden-death order in `combinedRankOverride` is used. **Neither seeding nor alphabetical group order is consulted**.

Buckets 1 through perGroup (12 entrants total) advance directly; buckets (perGroup+1) through (2\*perGroup) (12 entrants total) go to barrage.

## 3. Seed placement (straight numbering, shared across 2-4 groups)

The bucket-ordered result from selection is numbered straight through, in the same order it was produced:

```
Direct advancers: bucket 1..perGroup order, as-is → seeds 1, 2, 3, ... 12
Barrage:          bucket (perGroup+1)..(2*perGroup) order, as-is → seeds 13, 14, 15, ... 24
```

`selectFinalsEntrantsByGroup()` returns `{ directSeeds, barrageSeeds, groupCount }`, where `directSeeds[i].seed === i + 1` and `barrageSeeds[i].seed === TOTAL_FINALS_SLOTS + i + 1` always hold — a plain sequential numbering over whatever order the bucket method produced, with no other factor (alphabetical group order, same-group avoidance, etc.) involved.

The 16-player finals bracket side (`generateBracketStructure(16)` / `generatePlayoffStructure(12)`, `src/lib/double-elimination.ts`) uses pairings that match the real CDM 2025 official bracket:

- Direct-advancer seeds 1-12 sit in the Upper Bracket round-1 pairs `[[1,16],[8,9],[4,13],[5,12],[2,15],[7,10],[3,14],[6,11]]` (seeds 13-16 are reserved for barrage winners, below).
- Barrage (seeds 13-24) is a 12-player playoff with round-1 pairs `[[17,24],[20,21],[18,23],[19,22]]`; seeds 16/13/15/14 receive byes and advance straight to round 2. A barrage winner keeps their own seed number (one of 13-16) when they join the 16-player bracket — there's no re-mapping based on group or bucket.

### 3.1 Concrete example (2 groups)

With group A = 14 players and group B = 13 players, the 12 direct advancers get seeds 1-12 in the order produced by buckets 1-6 (each bucket holding one player from A and one from B, ordered within the bucket by match points -> point differential). This is not the fixed group-alphabetical placement of the old design (the former `TWO_GROUP_DIRECT_UPPER_SEEDS` etc.) — the within-bucket order, and hence which player gets which seed, depends on that tournament's actual results.

### 3.2 Concrete example (3 groups)

With 3 groups of 9+ players each, suppose Bucket 1 (each group's 1st-place finisher) has match points A1=5, B1=9, C1=7:

```
Bucket 1 order (by match points, descending): B1(9) -> C1(7) -> A1(5)
-> seed 1 = B1, seed 2 = C1, seed 3 = A1 (buckets 2+ continue the same way)
```

The order follows actual match points, not alphabetical group order — it is **determined by that specific tournament's actual results** (the same group sizes can produce a different bucket order from one event to the next). For 3 groups, this order carries straight through into the finals bracket seed numbers, with no reordering to avoid same-group matchups.

## 4. The 4-group case (internal logic)

`perGroup = 3`. Each group's places 1-3 advance directly (12 total), places 4-6 go to barrage (12 total), and 7th place onward is eliminated. Selection and seed placement both use exactly the same "bucket method, then straight numbering" logic as the 2- and 3-group cases.

This remains covered by the existing logic and tests, but cannot currently be selected through the UI or API.

## 5. Comparison table

| | 2 groups (supported) | 3 groups (supported) | 4 groups (internal logic) |
|---|---|---|---|
| perGroup | 6 | 4 | 3 |
| Direct-advancer selection | Each group's places 1-6 (group-internal rank as-is) | Buckets 1-4 (each group's Nth place, stacked and tie-broken by match points -> point differential) | Buckets 1-3 |
| Barrage selection | Each group's places 7-12 | Buckets 5-8 | Buckets 4-6 |
| Cross-group comparison needed? | No (coincides with the bucket method) | Yes (within-bucket tiebreak by match points -> point differential) | Yes (same) |
| Seed placement | Straight numbering over bucket order (1-12, 13-24) | Straight numbering over bucket order (same) | Straight numbering over bucket order (same) |
| Avoids same-group matchups? | No (matches the real CDM 2025 event) | No (same) | No (same) |
| Usable from the UI? | Yes | Yes | No |

## 6. Out of scope / known limitations

- **4+ groups through the UI/API**: out of scope per the decision in `docs/qualification-combined-ranking.md` §7. The existing 4-group internal logic remains, but it is unreachable from the UI (`group-setup-dialog.tsx`) or API (`qualification-route.ts`, `finals-route.ts`). Five or more groups are outside the internal logic's scope as well.
- **The CDM Excel template's own formulas**: `cdm-2025-template.xlsm`'s `SORTBY` formula was not changed (§7 Q6 of that same doc). The app's combined-ranking/finals-selection logic and the CDM Excel template's display may disagree for a period.

## 7. Related files

- Implementation: `src/lib/finals-group-selection.ts`, `src/lib/double-elimination.ts`
- Tests: `__tests__/lib/finals-group-selection.test.ts` (includes a golden regression test built from the official CDM 2025 results workbook), `__tests__/lib/double-elimination.test.ts`
- Combined-ranking (bucket method) spec: `docs/qualification-combined-ranking.md`
