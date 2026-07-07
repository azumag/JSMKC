# 2P Mode (BM/MR/GP) Qualification — Combined Ranking & Finals Cutoff Line Specification

*(English translation of `qualification-combined-ranking.md`. The Japanese document is the source of truth; if the two ever disagree, defer to the Japanese version.)*

Scope: the rules for determining a "combined ranking" (a single ranking spanning all groups) when group-stage qualification is split into 3 or more groups, and the generalization of the finals cutoff line (direct advancement / barrage / elimination) to 3+ groups.

**This document is a specification only — it does not include a code change.** The current code explicitly locks group counts to 2 in both the UI (`group-setup-dialog.tsx`) and the API (`qualification-route.ts`), and the finals-advancement logic (`finals-group-selection.ts`) still uses a placeholder round-robin-style ordering for 3+ groups, with an in-code comment stating "combined-ranking rules for 3+ groups are a separate follow-up." This document defines that deferred part.

## 1. Premise (parts already correctly implemented today)

The **in-group** ranking is already computed correctly by `assignRanksForPartition()` in `src/lib/server-ranking.ts`. The combined ranking takes this "final in-group ranking" as its input, so the following is not changed.

In-group tiebreak order (existing implementation):

1. **WDL score** (points = wins×2 + ties×1), descending
2. **Point differential (BM/MR) / cumulative driver points (GP)**, descending
   - BM/MR: `winRounds - lossRounds` (`bm-config.ts:123`, `mr-config.ts:135`)
   - GP: cumulative points earned per race, not a differential (`gp-config.ts:7-8, 188-189`)
3. **Head-to-head (H2H)**: re-sorts only among in-group players still tied after the above, using their head-to-head results (`server-ranking.ts:59-137`)
4. **Manual sudden-death confirmation by an admin** (`rankOverride`; shown in the UI as "Sudden Death Playoff", `qualification-playoff-manager.tsx`)

The "seed ranking" (the `seeding` field) is currently used only for group assignment and for determining match-up order (round-robin schedule), and is not used as a ranking tiebreak. This document adds a new role for it as a tiebreak.

## 2. Combined Ranking (Cross-Group) Determination Rules

### 2.1 Priority order

Taking the final in-group ranking (from Section 1) as input, all players across all groups are arranged into a single ranking using the following priority order:

1. **In-group rank** — if this differs, the player with the better in-group rank is unconditionally ranked higher, regardless of any other metric
2. **WDL score (points)**
3. **Seed ranking** (the value determined before qualification started; a smaller number ranks higher)
4. **Point differential (BM/MR) / driver points (GP)**
5. **Sudden death** (a new match)

### 2.2 The concept of an "in-group rank bucket"

Every group's "rank K" is treated together as one bucket. Buckets have an absolute order relative to each other — **everyone in bucket K is necessarily ranked above everyone in bucket K+1**, regardless of how their individual results compare. Items ②–⑤ in 2.1 act only as tiebreaks within the same bucket.

Example: even if A6 (rank 6 within Group A) beats B5 (rank 5 within Group B) on both points and point differential, bucket 6 ranks below bucket 5, so B5 ranks above A6.

### 2.3 When group sizes are uneven

With 3 or more groups, the player count may not divide evenly (e.g., 32 players → 3 groups = 11/11/10).

When building bucket K, **only include groups that actually have a player at that position**. A group that runs out of players simply has no entry in that bucket and beyond — no extra error handling or automatic bottom-ranking is needed.

This reuses the same idea as `__BREAK__` in `round-robin.ts` (a virtual opponent used to make the match schedule even when a group has an odd number of players; the real player is auto-awarded a win and the bye does not appear in the standings) — "a slot that doesn't exist quietly becomes a non-entry, without distorting comparisons among real players." However, `__BREAK__` itself (`BREAK_PLAYER_ID`) is purely a round-robin-schedule-generation mechanism, and building the combined-ranking buckets does not require creating any real `__BREAK__` record.

### 2.4 Handling sudden death

- **In-group tie** (1.④): continue the existing operation. An admin manually confirms via `rankOverride`, based on the in-group head-to-head result or the result of a newly played decider match.
- **Cross-group tie** (2.1⑤; all of ①–④ above are tied): since the players involved have never played each other, existing match results cannot be used. **A new decider match is arranged and played**, and the result is recorded through the existing `rankOverride` mechanism. For ties among 3 or more players, this is expected to be either a round-robin of decider matches, or an operation similar to the existing "Sudden Death Playoff" UI (an admin confirms the ranking after seeing the results).

## 3. Worked Sample: 2 Groups, 32 Players

The correct combined ranking obtained by applying the above rules to the attached PDF example (16 players × 2 groups). The 4 ordering errors found in the PDF (B1/A1, A3/B2, A6/B5, B16/A15) can all be explained by the rule "if in-group rank differs, it takes absolute priority."

| Rank | Player | In-group rank | Points | Diff. | Notes |
|---|---|---|---|---|---|
| 1 | A1 | 1 | 30 | +50 | Tied on points with B1. B1 has the better differential (+58), but decided by seed ranking, where A1 ranks higher |
| 2 | B1 | 1 | 30 | +58 | |
| 3 | A2 | 2 | 27 | +46 | |
| 4 | B2 | 2 | 27 | +42 | |
| 5 | A3 | 3 | 27 | +42 | In-group rank (3rd) is below B2 (2nd), so fixed below B2 |
| 6 | B3 | 3 | 24 | +34 | |
| 7 | B4 | 4 | 24 | +32 | |
| 8 | A4 | 4 | 23 | +30 | |
| 9 | A5 | 5 | 22 | +24 | |
| 10 | B5 | 5 | 19 | +8 | A6 leads on points and differential, but B5's in-group rank (5th) is better than A6's (6th), so B5 takes priority |
| 11 | A6 | 6 | 20 | +24 | |
| 12 | B6 | 6 | 18 | +16 | |
| 13 | A7 | 7 | 18 | +12 | |
| 14 | B7 | 7 | 17 | +2 | |
| 15 | B8 | 8 | 16 | +10 | |
| 16 | A8 | 8 | 15 | 0 | |
| 17 | A9 | 9 | 13 | -6 | |
| 18 | B9 | 9 | 12 | -6 | |
| 19 | B10 | 10 | 12 | -16 | |
| 20 | A10 | 10 | 11 | -14 | |
| 21 | A11 | 11 | 11 | -18 | |
| 22 | B11 | 11 | 9 | -24 | |
| 23 | B12 | 12 | 8 | -16 | |
| 24 | A12 | 12 | 8 | -28 | |
| 25 | B13 | 13 | 8 | -30 | |
| 26 | A13 | 13 | 6 | -28 | |
| 27 | B14 | 14 | 6 | -38 | |
| 28 | A14 | 14 | 6 | -40 | |
| 29 | B15 | 15 | 5 | -36 | Already beat B16 in their in-group head-to-head |
| 30 | A15 | 15 | 3 | -42 | B16 leads on points and differential, but A15's in-group rank (15th) is better than B16's (16th), so A15 takes priority |
| 31 | B16 | 16 | 5 | -36 | |
| 32 | A16 | 16 | 0 | -52 | |

## 4. Finals Cutoff Line (Generalization to 3+ Groups)

### 4.1 Current mechanism (2 groups)

See `src/lib/finals-group-selection.ts`. The total number of finals slots is a fixed constant, `TOTAL_FINALS_SLOTS = 12` (it is not derived from the number of entrants).

```
perGroup = 12 / number of groups
Ranks 1 to perGroup in each group           → Direct advancement (Upper Bracket)
Ranks (perGroup+1) to (2*perGroup) in each group → Barrage (survival tournament)
Ranks (2*perGroup+1) and below in each group      → Eliminated
```

With 2 groups, `perGroup = 6`. 12 players advance directly + 12 players enter the barrage (4 of whom advance through the barrage into the Top 16) = Top 16. This matches the PDF's "Top 16 confirmed line" (combined ranks 1–12) and "qualification line" (ranks 13–24 go to the survival tournament).

Important: this "fixed count per group" approach mathematically matches taking combined ranks 1–12 from Section 2 **only when group sizes are equal** (because of the rule "if in-group rank differs, it takes absolute priority," bucket K necessarily contains exactly one player from each group).

### 4.2 Generalization to 3 groups

```
perGroup = 12 / 3 = 4
Ranks 1–4 in each group  → Direct advancement (12 players total)
Ranks 5–8 in each group  → Barrage (12 players total)
Rank 9 and below in each group → Eliminated
```

The total number of finals slots (Top 16 = 12 direct + 12 barrage) stays fixed regardless of the number of groups.

Even with uneven group sizes (e.g., 11/11/10), this holds as long as every group has at least `2 * perGroup = 8` players (the same condition already validated by `selectFinalsEntrantsByGroup` in the existing code).

### 4.3 Out of scope

The **seed placement within the finals bracket** (the ordering used to avoid same-group matchups; for 2 groups this is defined via the fixed token maps `TWO_GROUP_DIRECT_UPPER_SEEDS` / `TWO_GROUP_BARRAGE_SEED_TOKENS`) is out of scope for this document. As already noted in the existing code comments, it is to be split out as a separate task. **Selecting who advances directly / enters the barrage** for 3 groups (Section 4.2) is defined in this document, but **the ordering of those seeds** is left for future consideration.

## 5. Terminology Mapping

| Term in this document | Name in code | Notes |
|---|---|---|
| In-group rank | Output of `assignRanksForPartition()` (`_rank`) | Already implemented, unchanged |
| WDL score / points | `score` (`wins*2+ties`) | Same formula across all modes |
| Point differential | `points` (BM/MR) | `winRounds - lossRounds` |
| Driver points | `points` (GP) | Cumulative points earned per race, not a differential |
| Seed ranking | `seeding` | Currently used only for group assignment and match-up order. This document adds its use as a tiebreak |
| Sudden death | `rankOverride` / `rankOverrideBy` / `rankOverrideAt` (shown in the UI as "Sudden Death Playoff") | In-group ties continue under the existing operation. Cross-group ties require a new match |

## 6. Implementation Impact Scope (for reference — not changed by this document)

Areas expected to be affected when this specification is implemented in the future:

- `computeCombinedRanks()` in `src/lib/ranking-utils.ts` — currently a simple sort on raw points/differential only, does not yet support this document's rules
- `selectFinalsEntrantsByGroup()` in `src/lib/finals-group-selection.ts` — still uses a placeholder round-robin-style ordering for 3–4 groups
- `LOCKED_GROUP_COUNT = 2` in `src/components/tournament/group-setup-dialog.tsx` — needs to be unlocked for 3+ groups
- `src/lib/api-factories/qualification-route.ts:442-449` — needs the Group A/B–only validation removed
- `aggregateGroupQualificationPoints()` in `src/lib/points/qualification-points.ts` — currently unused (referenced only by tests). It already embeds a different approach — normalizing for group-size differences — which overlaps in role with this document's bucket approach, so at implementation time these two approaches need to be reconciled and one chosen
