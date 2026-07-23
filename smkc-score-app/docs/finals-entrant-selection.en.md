# Finals Entrant Selection (2, 3, and 4 Groups)

Scope: `selectFinalsEntrantsByGroup()` and the placement logic that creates the Top-24 barrage and Top-16 bracket.

## 1. Shared advancement quotas

The number of entrants is shared across group counts.

```text
perGroup = 12 / group count

Each group's places 1..perGroup                 → Direct (12 total)
Each group's places perGroup+1..2*perGroup      → Barrage (12 total)
Each group's places after 2*perGroup            → Eliminated
```

Every group must contain at least `2 * perGroup` players. Group-internal places are the finalized places after the mode's normal ranking rules, head-to-head resolution, and any required sudden-death override.

The quotas are shared, but placement into bracket slots differs by group count.

## 2. Two groups: fixed placement

`perGroup = 6`. Each group's places 1-6 advance directly and places 7-12 enter barrage. Cross-group statistics must not move these placements.

With two groups, the alternating A/B displayed-seed map is authoritative.

### 2.1 Direct entrants

```text
Upper seed → group place
1:A1  2:B1  3:A2  4:B2  5:A3  6:B3
7:A4  8:B4  9:A5  10:B5 11:A6 12:B6
```

Upper seeds `13 / 14 / 15 / 16` are filled by the four barrage survivors.

### 2.2 Barrage

The fixed placement under displayed seeds 13-24 is:

```text
13:A7  14:B7  15:A8  16:B8  17:A9  18:B9
19:A10 20:B10 21:A11 22:B11 23:A12 24:B12
```

Round 1 and Upper destinations are:

```text
winner of [17,24] vs [16] → Upper 16
winner of [20,21] vs [13] → Upper 13
winner of [18,23] vs [15] → Upper 15
winner of [19,22] vs [14] → Upper 14
```

Match points, point differential, and seeding never change this placement.

## 3. Three groups: dynamic bucket order

`perGroup = 4`. Each group's places 1-4 advance directly, places 5-8 enter barrage, and place 9 onward is eliminated.

A fixed map cannot distribute three groups evenly. Players with the same group-internal place are therefore collected into a bucket, and only the order inside that bucket is dynamic:

1. WDL score / match points, descending
2. point differential or drivers' points, descending
3. `combinedRankOverride` from a cross-group sudden-death playoff when still exactly tied

Seeding is not a tiebreaker. Every player in Bucket N remains ahead of every player in Bucket N+1.

Buckets 1-4 receive seeds 1-12 and Buckets 5-8 receive seeds 13-24 in order. The placement verified against the official CDM 2025 result is:

```text
Upper R1: [1,16] [8,9] [4,13] [5,12]
          [2,15] [7,10] [3,14] [6,11]

Barrage R1: [17,24] [20,21] [18,23] [19,22]
Barrage BYEs: 16 / 13 / 15 / 14
```

For three groups, a barrage winner keeps their own seed 13-16 when entering Upper. Same-group Round-1 matches can occur.

## 4. Four groups

Four groups can be evenly distributed and will therefore use a fixed map like the two-group case. Tournament operations has not supplied that map yet, and four-group tournaments cannot currently be created through the UI or API.

Provisional internal bucket handling remains but is not an approved specification. Do not expose it as a production feature until the fixed map is supplied.

## 5. CDM Excel export

After a BM/MR finals bracket is generated, the exporter reconstructs the seed list and match slots with the matching group-count layout.

- Two groups use the fixed layout in section 2.
- Three groups use the dynamic order and CDM 2025 layout in section 3.
- All BM/MR/GP Finals exports replace the seed-list input with the immutable KO seed snapshot. Later qualification corrections never relabel a published bracket.
- The Excel qualification standings recalculate independently. They can differ from JSMKC when head-to-head, sudden-death overrides, or uneven groups are involved.

## 6. Related files

- Selection: `src/lib/finals-group-selection.ts`
- Bracket placement: `src/lib/double-elimination.ts`
- API: `src/lib/api-factories/finals-route.ts`
- CDM export: `src/lib/cdm-export/fill/finals.ts`
- Regression tests: `__tests__/lib/finals-group-selection.test.ts`, `__tests__/lib/double-elimination.test.ts`, `__tests__/lib/api-factories/finals-route.test.ts`
