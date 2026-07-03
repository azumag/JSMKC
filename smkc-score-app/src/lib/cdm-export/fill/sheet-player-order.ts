/**
 * CDM qualification sheet — player ordering helpers (shared by BM/MR/GP).
 *
 * The CDM template derives, for every versus mode, two ordered views of the
 * qualifiers entirely from Main Hub's synthesized "Order" column:
 *
 *   F2 = VSTACK(
 *          IF(P4>0, SEQUENCE(P2/P4, 1, 1, P4), ""),   // group A: Orders 1, 1+G, 1+2G…
 *          IF(P4>1, SEQUENCE(P2/P4, 1, 2, P4), ""),   // group B: Orders 2, 2+G, …
 *          IF(P4>2, SEQUENCE(P2/P4, 1, 3, P4), ""),   // group C
 *          IF(P4>3, SEQUENCE(P2/P4, 1, 4, P4), ""))   // group D
 *   G2 = XLOOKUP(F2, Order, Nickname)                 // the G2# spill order
 *
 * (Verified against /tmp/cdm-analysis/sheet2025/sheet_BM_Qualifications.txt,
 * cells E2/F2/G2; P2 = group size * groups, P4 = group count G.)
 *
 * Because that listing emits group A in full, then group B in full, etc., and
 * because within a group the SEQUENCE step is `+G` (so it walks the group's
 * members in their Order-ascending sequence), the spill order — and therefore
 * the per-player match-block order on the sheet — is simply:
 *
 *     group label ascending, then app seeding ascending within the group.
 *
 * To make the sheet re-derive the *app's* groups (its serpentine assignment,
 * not the template's interleave), we synthesize each player's Main Hub Order as
 * `Order = groupIndex + 1 + k*G` for the k-th (0-based, seeding-ascending)
 * player of that group. See docs/cdm-export-design.md §3.1.1.
 */

import type { CdmCellWrite, CdmSheetName } from "../types";
import type { CdmModeQualification } from "../types";

/** Group labels in the order the template lists them (A, B, C, D). */
const GROUP_LABELS = ["A", "B", "C", "D"] as const;

/**
 * Accumulates cell writes for one sheet, keyed by A1 ref so that a later write
 * to the same cell overwrites the earlier one (last-wins) instead of emitting a
 * duplicate. This lets a fill map "clear then conditionally overwrite" a cell
 * without producing two ops for it — the downstream XML patcher applies the
 * array in order, and we keep that array one-op-per-cell.
 *
 * Insertion order is preserved (Map iteration order) so the emitted array stays
 * deterministic and reviewable.
 */
export class SheetWriteBuilder {
  private readonly ops = new Map<string, CdmCellWrite>();

  constructor(private readonly sheet: CdmSheetName) {}

  /** Set an inline string value (cell must not be a formula in the template). */
  setString(ref: string, value: string): void {
    this.ops.set(ref, { sheet: this.sheet, ref, op: "inlineString", value });
  }

  /** Set a numeric value (cell must not be a formula in the template). */
  setNumber(ref: string, value: number): void {
    this.ops.set(ref, { sheet: this.sheet, ref, op: "number", value });
  }

  /** Drop the cached value but keep the cell, its style and any formula. */
  clear(ref: string): void {
    this.ops.set(ref, { sheet: this.sheet, ref, op: "clearValue" });
  }

  /**
   * Reduce a cell to a styled empty shell: drop value, formula AND the
   * t/cm/vm attributes. Unlike {@link clear} this removes `vm` (value
   * metadata), which is mandatory for rich-value cells — a cleared-but-not
   * stripped rich value keeps its `vm` pointer into xl/richData, so Excel
   * still renders the stale linked value (e.g. the template's old country
   * flag) even with no cached <v>. See main-hub.ts Country handling.
   */
  strip(ref: string): void {
    this.ops.set(ref, { sheet: this.sheet, ref, op: "strip" });
  }

  /**
   * Write either a number or, when the value is null/undefined, clear the cell.
   * Centralises the "absent input becomes a blank, never a bogus 0" rule that
   * every CDM input column relies on (0 would rank as fastest time / a real
   * score). Returns nothing; mutates the builder.
   */
  setNumberOrClear(ref: string, value: number | null | undefined): void {
    if (value == null) this.clear(ref);
    else this.setNumber(ref, value);
  }

  /** As {@link setNumberOrClear} but for inline strings. */
  setStringOrClear(ref: string, value: string | null | undefined): void {
    if (value == null || value === "") this.clear(ref);
    else this.setString(ref, value);
  }

  /** Materialise the accumulated ops as a flat array (one per cell). */
  build(): CdmCellWrite[] {
    return [...this.ops.values()];
  }
}

/**
 * Excel SORT / SORTBY ascending comparison: case-insensitive, with a stable
 * tie-break on the raw UTF-16 code units so equal-ignoring-case strings keep a
 * deterministic order. The TT Qualifications sheet sorts nicknames with
 * `SORT(FILTER(...))`, which is case-insensitive and stable; reproducing that
 * here lets us place each player on the correct row. Non-ASCII collation may
 * differ from Excel's locale-aware compare — a documented known limitation.
 */
export function excelCaseInsensitiveCompare(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la < lb) return -1;
  if (la > lb) return 1;
  // Case-insensitively equal: stabilise on the original code units so the
  // ordering is deterministic regardless of the engine's sort stability.
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Group a mode's qualifications by their group label and, within each group,
 * order them by app seeding ascending (null seeds last, in stable input order).
 *
 * The result is the canonical "sheet order": iterating groups A→B→C→D and, in
 * each, seeding-ascending. Both {@link computeSheetPlayerOrder} and
 * {@link synthesizeModeOrders} are built on this single ordering so the block
 * placement and the synthesized Main Hub Order can never disagree.
 */
function groupedSeededOrder(quals: CdmModeQualification[]): CdmModeQualification[][] {
  // Collect the distinct groups that actually appear, in canonical A→D order.
  // Unknown labels (defensive) are appended after the known ones, sorted, so
  // the function never silently drops a player.
  const present = new Set(quals.map((q) => q.group));
  const knownGroups = GROUP_LABELS.filter((g) => present.has(g));
  const extraGroups = [...present]
    .filter((g) => !GROUP_LABELS.includes(g as (typeof GROUP_LABELS)[number]))
    .sort(excelCaseInsensitiveCompare);
  const orderedGroups = [...knownGroups, ...extraGroups];

  return orderedGroups.map((group) => {
    // Preserve input order for the stable null-seed tail by remembering the
    // original index; sort seeded players ascending and keep nulls after them.
    const members = quals
      .map((q, index) => ({ q, index }))
      .filter((entry) => entry.q.group === group);
    members.sort((x, y) => {
      const sx = x.q.seeding;
      const sy = y.q.seeding;
      if (sx == null && sy == null) return x.index - y.index; // both null: stable
      if (sx == null) return 1; // nulls sort last
      if (sy == null) return -1;
      if (sx !== sy) return sx - sy; // seeding ascending
      return x.index - y.index; // equal seeding: stable input order
    });
    return members.map((entry) => entry.q);
  });
}

/**
 * Reproduce the sheet's G2# spill order: group A players (app seeding
 * ascending), then group B, then C, then D. Block i on the qualification sheet
 * is owned by `computeSheetPlayerOrder(quals)[i]`.
 */
export function computeSheetPlayerOrder(
  quals: CdmModeQualification[],
): CdmModeQualification[] {
  return groupedSeededOrder(quals).flat();
}

/**
 * Synthesize each player's Main Hub Order so the sheet's interleave re-derives
 * the app's groups. For the k-th (0-based) player of group g (group index gi),
 * `Order = gi + 1 + k*G` where G is the distinct group count.
 *
 * Returns a Map keyed by playerId. Players appear exactly once (one
 * qualification per player per mode is guaranteed by the unique DB constraint).
 */
export function synthesizeModeOrders(
  quals: CdmModeQualification[],
): Map<string, number> {
  const groups = groupedSeededOrder(quals);
  const groupCount = groups.length; // G
  const orders = new Map<string, number>();

  groups.forEach((members, groupIndex) => {
    members.forEach((member, k) => {
      // gi + 1 + k*G — interleaved so XLOOKUP(SEQUENCE(...,gi+1,G)) recovers
      // exactly this group's members in this order.
      orders.set(member.player.id, groupIndex + 1 + k * groupCount);
    });
  });

  return orders;
}
