/**
 * Shared assertion helpers for CDM fill-map tests.
 *
 * Each fill function returns a flat CdmCellWrite[] that a downstream XML patcher
 * applies in array order (last write wins per ref). These helpers let tests
 * reason about the *effective* state per cell, and assert that the fill map
 * never emits a duplicate op for the same cell (clear-then-write is collapsed
 * by the fill functions themselves to a single op per ref).
 */

import type { CdmCellWrite, CdmSheetName } from "@/lib/cdm-export/types";

/** Build a Map ref -> op for a single sheet, asserting no duplicate refs. */
export function indexWrites(
  writes: CdmCellWrite[],
  sheet: CdmSheetName,
): Map<string, CdmCellWrite> {
  const map = new Map<string, CdmCellWrite>();
  for (const w of writes) {
    if (w.sheet !== sheet) continue;
    if (map.has(w.ref)) {
      throw new Error(
        `duplicate write for ${sheet}!${w.ref}: fill maps must emit one op per cell`,
      );
    }
    map.set(w.ref, w);
  }
  return map;
}

/** Assert a cell carries the given inline-string value. */
export function expectString(
  map: Map<string, CdmCellWrite>,
  ref: string,
  value: string,
): void {
  const w = map.get(ref);
  expect(w).toBeDefined();
  expect(w).toMatchObject({ op: "inlineString", value });
}

/** Assert a cell carries the given numeric value. */
export function expectNumber(
  map: Map<string, CdmCellWrite>,
  ref: string,
  value: number,
): void {
  const w = map.get(ref);
  expect(w).toBeDefined();
  expect(w).toMatchObject({ op: "number", value });
}

/** Assert a cell is cleared (value dropped, formula/style kept). */
export function expectClear(map: Map<string, CdmCellWrite>, ref: string): void {
  const w = map.get(ref);
  expect(w).toBeDefined();
  expect(w?.op).toBe("clearValue");
}

/** Assert no write at all targets a given cell. */
export function expectUntouched(
  map: Map<string, CdmCellWrite>,
  ref: string,
): void {
  expect(map.has(ref)).toBe(false);
}

/** Collect every ref written on a sheet (for "nothing outside set X" checks). */
export function writtenRefs(
  writes: CdmCellWrite[],
  sheet: CdmSheetName,
): Set<string> {
  return new Set(writes.filter((w) => w.sheet === sheet).map((w) => w.ref));
}
