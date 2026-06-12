/**
 * CDM workbook export — public entry point.
 *
 * `generateCdmWorkbook` is the single function the export route calls. It turns a
 * fully-assembled CdmTournamentData into a finished .xlsm by:
 *   1. asking every fill builder for its CdmCellWrite[] (each builder is a pure
 *      function over the tournament data — see fill/*.ts and
 *      docs/cdm-export-design.md §3), and
 *   2. concatenating those writes and applying them to the template ONCE via
 *      patchCdmWorkbook (ZIP surgery: only the touched worksheet XML changes;
 *      tables/richData/metadata/styles/sharedStrings pass through byte-for-byte).
 *
 * Builder order matters only for human readability of the resulting array —
 * patchCdmWorkbook groups writes by sheet, and the per-sheet builders each own a
 * disjoint set of sheets, so there is no cross-builder ref collision. We keep
 * the order Main Hub → TT Qualifications → BM/MR/GP Qualifications → BM/MR/GP
 * Finals → TT Finals to mirror the workbook's tab order and the design doc.
 *
 * This module is deliberately thin: it adds NO data transformation of its own.
 * The route is responsible for mapping prisma rows into CdmTournamentData; the
 * builders own every cell-level decision; the patcher owns the OOXML surgery.
 */
import type { CdmCellWrite, CdmTournamentData } from "./types";
import { patchCdmWorkbook } from "./xlsx-zip-patcher";
import { buildMainHubWrites } from "./fill/main-hub";
import { buildTTQualificationWrites } from "./fill/tt-qualifications";
import { buildQualificationWrites } from "./fill/qualifications";
import { buildFinalsWrites } from "./fill/finals";
import { buildTTFinalsWrites } from "./fill/tt-finals";

export function generateCdmWorkbook(
  template: Uint8Array,
  data: CdmTournamentData,
): Uint8Array {
  // Each builder returns one op per cell for its own sheet(s); concatenating is
  // safe because no two builders write the same sheet (Main Hub, TT
  // Qualifications, the three Qualification sheets, the three Finals sheets and
  // TT Finals are all disjoint). Order follows the workbook tab layout.
  const writes: CdmCellWrite[] = [
    ...buildMainHubWrites(data),
    ...buildTTQualificationWrites(data),
    ...buildQualificationWrites(data, "bm"),
    ...buildQualificationWrites(data, "mr"),
    ...buildQualificationWrites(data, "gp"),
    ...buildFinalsWrites(data, "bm"),
    ...buildFinalsWrites(data, "mr"),
    ...buildFinalsWrites(data, "gp"),
    ...buildTTFinalsWrites(data),
  ];

  return patchCdmWorkbook(template, writes);
}
