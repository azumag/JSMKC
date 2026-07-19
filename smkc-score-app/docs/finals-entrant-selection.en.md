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

With two groups, even distribution and same-group Round-1 avoidance can both be achieved, so the handwritten fixed map is authoritative.

### 2.1 Direct entrants

```text
Upper seed → group place
1:A1  2:B3  3:B1  4:A3  5:B2  6:A4
7:A2  8:B4  9:A5  11:B5  13:B6  15:A6
```

Upper seeds `10 / 12 / 14 / 16` are reserved for barrage winners.

### 2.2 Barrage

The fixed placement under displayed seeds 13-24 is:

```text
13:B8  14:B7  15:A8  16:A7  17:B9  18:A11
19:B10 20:A12 21:A10 22:B12 23:A9  24:B11
```

Round 1 and Upper destinations are:

```text
winner of [23,22] vs [13] → Upper 16
winner of [19,18] vs [16] → Upper 12
winner of [17,20] vs [15] → Upper 14
winner of [21,24] vs [14] → Upper 10
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
- GP Finals keeps its Excel formula spill, so exact parity is not guaranteed when qualification order differs.
- The Excel qualification standings recalculate independently. They can differ from JSMKC when head-to-head, sudden-death overrides, or uneven groups are involved.

## 6. Related files

- Selection: `src/lib/finals-group-selection.ts`
- Bracket placement: `src/lib/double-elimination.ts`
- API: `src/lib/api-factories/finals-route.ts`
- CDM export: `src/lib/cdm-export/fill/finals.ts`
- Regression tests: `__tests__/lib/finals-group-selection.test.ts`, `__tests__/lib/double-elimination.test.ts`, `__tests__/lib/api-factories/finals-route.test.ts`
