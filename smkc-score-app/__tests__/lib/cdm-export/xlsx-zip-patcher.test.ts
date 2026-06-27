/**
 * patchCdmWorkbook integration tests (t-wada TDD).
 *
 * These run against the REAL template public/templates/cdm-2025-template.xlsm,
 * read from disk with fs, because the whole point of the rewrite is byte-level
 * fidelity to that workbook. The old SheetJS exporter silently dropped
 * xl/tables/* and xl/richData/* and corrupted the dynamic-array formula web;
 * the assertions below are the regression guards that lock that out:
 *
 *  - a no-op patch changes ONLY xl/workbook.xml (calcPr), [Content_Types].xml
 *    (calcChain Override removed) and xl/_rels/workbook.xml.rels (calcChain
 *    Relationship removed); every other part is byte-identical.
 *  - xl/calcChain.xml is gone and calcPr forces a full automatic recalculation.
 *  - touched sheets keep formulas but drop stale cached formula values.
 *  - tables/table1.xml and richData/rdrichvalue.xml survive untouched.
 *  - real input cells (Main Hub) accept inlineString / number / clearValue and
 *    neighbouring bytes are unchanged.
 *  - writing a number over an ARRAY-formula cell (Overall Ranking B2) throws.
 *  - a perf smoke test applies 20k ops to a real sheet within a few seconds.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { unzipSync, strFromU8 } from "fflate";
import { patchCdmWorkbook } from "@/lib/cdm-export/xlsx-zip-patcher";
import type { CdmCellWrite } from "@/lib/cdm-export/types";

const TEMPLATE_PATH = join(
  process.cwd(),
  "public",
  "templates",
  "cdm-2025-template.xlsm"
);

function loadTemplate(): Uint8Array {
  return new Uint8Array(readFileSync(TEMPLATE_PATH));
}

/** Unzip helper returning the raw byte map. */
function parts(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes);
}

/** Byte-equality helper for two Uint8Arrays. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

describe("patchCdmWorkbook — no-op pass-through fidelity", () => {
  const original = loadTemplate();
  const originalParts = parts(original);
  const out = patchCdmWorkbook(loadTemplate(), []);
  const outParts = parts(out);

  it("preserves every non-worksheet part except workbook.xml, content types and workbook rels", () => {
    const allowedToDiffer = new Set([
      "xl/workbook.xml",
      "[Content_Types].xml",
      "xl/_rels/workbook.xml.rels",
    ]);
    const removed = new Set(["xl/calcChain.xml"]);

    for (const path of Object.keys(originalParts)) {
      if (removed.has(path)) continue; // expected to be gone
      if (allowedToDiffer.has(path)) continue; // checked individually below
      // Worksheet XML is now expected to differ even on a no-op patch: stale
      // CDM2025 cached formula AND dynamic-array spill-child values are stripped
      // from EVERY sheet so no template-era data can render before recalc. The
      // irreplaceable parts the old SheetJS exporter destroyed (tables, richData,
      // media, styles, sharedStrings, metadata, …) must still pass through
      // byte-for-byte, which is what this loop guards.
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) continue;
      expect(outParts[path]).toBeDefined();
      expect(bytesEqual(outParts[path], originalParts[path])).toBe(true);
    }
  });

  it("removes xl/calcChain.xml", () => {
    expect(originalParts["xl/calcChain.xml"]).toBeDefined();
    expect(outParts["xl/calcChain.xml"]).toBeUndefined();
  });

  it("keeps tables and richData parts that the old exporter destroyed", () => {
    expect(outParts["xl/tables/table1.xml"]).toBeDefined();
    expect(bytesEqual(outParts["xl/tables/table1.xml"], originalParts["xl/tables/table1.xml"])).toBe(true);
    expect(outParts["xl/richData/rdrichvalue.xml"]).toBeDefined();
    expect(
      bytesEqual(outParts["xl/richData/rdrichvalue.xml"], originalParts["xl/richData/rdrichvalue.xml"])
    ).toBe(true);
  });

  it("keeps all 12 worksheet parts but strips their stale cached values", () => {
    const sheets = Object.keys(originalParts).filter((p) =>
      /^xl\/worksheets\/sheet\d+\.xml$/.test(p)
    );
    expect(sheets.length).toBe(12);
    for (const sheet of sheets) expect(outParts[sheet]).toBeDefined();

    // Overall Ranking (sheet12) is never written by the fill map, yet it must no
    // longer carry the CDM2025 roster: the SORT(UNIQUE(Registration[Nickname]))
    // anchor formula survives, but the names it spilled (B3..B61, t="str" cells
    // with no <f>) are cleared so Excel re-spills the new tournament's players.
    const overall = strFromU8(outParts["xl/worksheets/sheet12.xml"]);
    expect(overall).toContain(
      "_xlfn._xlws.SORT(_xlfn.UNIQUE(Registration[Nickname]))",
    );
    expect(overall).not.toContain("<v>Bluh</v>");
    expect(overall).not.toContain("<v>Drew</v>");
    expect(overall).not.toContain("<v>Sami</v>");
  });

  it("adds full-recalculation attributes to calcPr in workbook.xml", () => {
    const wb = strFromU8(outParts["xl/workbook.xml"]);
    expect(wb).toContain('calcMode="auto"');
    expect(wb).toContain('fullCalcOnLoad="1"');
    expect(wb).toContain('forceFullCalc="1"');
    // The original calcId must be preserved.
    expect(wb).toContain('calcId="191028"');
  });

  it("removes the calcChain Override from [Content_Types].xml", () => {
    const ct = strFromU8(outParts["[Content_Types].xml"]);
    expect(ct).not.toContain("calcChain.xml");
  });

  it("removes the calcChain Relationship from workbook.xml.rels", () => {
    const rels = strFromU8(outParts["xl/_rels/workbook.xml.rels"]);
    expect(rels).not.toContain("calcChain.xml");
  });

  it("preserves the zip entry order (minus calcChain)", () => {
    const expectedOrder = Object.keys(originalParts).filter(
      (p) => p !== "xl/calcChain.xml"
    );
    const actualOrder = Object.keys(outParts);
    expect(actualOrder).toEqual(expectedOrder);
  });
});

describe("patchCdmWorkbook — real cell writes", () => {
  function readSheet(out: Uint8Array, sheetPath: string): string {
    return strFromU8(parts(out)[sheetPath]);
  }

  it("writes inlineString, number and clearValue into Main Hub input cells", () => {
    const writes: CdmCellWrite[] = [
      { sheet: "Main Hub", ref: "B2", op: "inlineString", value: "Mario Kart" },
      { sheet: "Main Hub", ref: "O3", op: "number", value: 16 },
      { sheet: "Main Hub", ref: "E2", op: "clearValue" },
    ];
    const out = patchCdmWorkbook(loadTemplate(), writes);
    const sheet1 = readSheet(out, "xl/worksheets/sheet1.xml");

    // B2 became an inline string (was a shared-string cell t="s").
    expect(sheet1).toContain('<c r="B2" s="2" t="inlineStr"><is><t>Mario Kart</t></is></c>');
    // O3 set to 16 (was <c r="O3" s="3"><v>24</v></c>).
    expect(sheet1).toContain('<c r="O3" s="3"><v>16</v></c>');
    // E2 value cleared (was <c r="E2" s="4"><v>38</v></c>) — keeps styled shell.
    expect(sheet1).toContain('<c r="E2" s="4"/>');
  });

  it("leaves the byte slice of an untouched neighbour cell unchanged", () => {
    const writes: CdmCellWrite[] = [
      { sheet: "Main Hub", ref: "C2", op: "inlineString", value: "Nick" },
    ];
    const out = patchCdmWorkbook(loadTemplate(), writes);
    const sheet1 = readSheet(out, "xl/worksheets/sheet1.xml");
    // B2 (the immediate left neighbour) must be reproduced exactly.
    expect(sheet1).toContain('<c r="B2" s="2" t="s"><v>13</v></c>');
    // A2's formula is untouched, but its stale cached value is removed on
    // touched sheets so generated files cannot display template-era results.
    expect(sheet1).toContain('<c r="A2" s="40"><f>ROW()-1</f></c>');
  });

  it("drops cached values from formula cells on touched sheets", () => {
    const writes: CdmCellWrite[] = [
      { sheet: "BM Finals", ref: "H5", op: "number", value: 4 },
    ];
    const out = patchCdmWorkbook(loadTemplate(), writes);
    const sheet7 = readSheet(out, "xl/worksheets/sheet7.xml");

    expect(sheet7).toContain('<f>_xlfn.XLOOKUP(E5,A:A,B:B)</f>');
    expect(sheet7).toContain('<c r="F5" s="13" t="str"><f>_xlfn.XLOOKUP(E5,A:A,B:B)</f></c>');
    expect(sheet7).not.toContain('<f>_xlfn.XLOOKUP(E5,A:A,B:B)</f><v>Patrick</v>');
  });

  it("throws when a number is written over an ARRAY-formula cell (Overall Ranking B2)", () => {
    const writes: CdmCellWrite[] = [
      { sheet: "Overall Ranking", ref: "B2", op: "number", value: 1 },
    ];
    expect(() => patchCdmWorkbook(loadTemplate(), writes)).toThrow(/B2/);
  });

  it("strip removes the <f> from a formula cell", () => {
    const writes: CdmCellWrite[] = [
      { sheet: "Overall Ranking", ref: "B2", op: "strip" },
    ];
    const out = patchCdmWorkbook(loadTemplate(), writes);
    const sheet12 = readSheet(out, "xl/worksheets/sheet12.xml");
    // The B2 array formula text must be gone; a styled shell remains.
    expect(sheet12).not.toContain("_xlfn._xlws.SORT(_xlfn.UNIQUE(Registration[Nickname]))");
    expect(sheet12).toContain('<c r="B2" s="32"/>');
  });

  it("strips stale cached values from dynamic-array spill child cells", () => {
    // Overall Ranking (sheet12) is never written by the fill map. Its B column is
    // the spill of SORT(UNIQUE(Registration[Nickname])) anchored at B2; the
    // template persists the CDM2025 spill children (B3..B61) as t="str" cells with
    // NO <f> of their own, e.g. <c r="B7" s="32" t="str"><v>Bluh</v></c>. The old
    // strip only touched cells containing <f>, so those names survived and Excel
    // rendered the stale CDM2025 roster. A no-op patch must already remove them.
    const out = patchCdmWorkbook(loadTemplate(), []);
    const overall = readSheet(out, "xl/worksheets/sheet12.xml");
    expect(overall).not.toContain("<v>Bluh</v>");
    expect(overall).not.toContain("<v>Drew</v>");
    expect(overall).not.toContain("<v>Sami</v>");
    // The spill ANCHOR formula must remain intact — only its cached value is gone.
    expect(overall).toContain(
      "_xlfn._xlws.SORT(_xlfn.UNIQUE(Registration[Nickname]))",
    );
  });

  it("strips spill children on a touched sheet too (TT Qualifications)", () => {
    // TT Qualifications (sheet3) B2:B48 / F2:F48 spill FILTER/SORT of the roster.
    // Writing an input cell makes the sheet "touched"; the spill children must be
    // cleared on that path as well, not just on untouched sheets.
    const out = patchCdmWorkbook(loadTemplate(), [
      { sheet: "TT Qualifications", ref: "G2", op: "number", value: 11034 },
    ]);
    const ttQual = readSheet(out, "xl/worksheets/sheet3.xml");
    expect(ttQual).not.toContain("<v>Bluh</v>");
    expect(ttQual).not.toContain("<v>Drew</v>");
    expect(ttQual).not.toContain("<v>Sami</v>");
    // The input we wrote must OUTLIVE the strip — G2 is a plain input cell, not a
    // spill child, so clearing spill ranges must not touch it.
    expect(ttQual).toContain('<c r="G2" s="45"><v>11034</v></c>');
  });

  it("throws when a value is written into a dynamic-array spill cell", () => {
    // Overall Ranking B2 anchors SORT(UNIQUE(Registration[Nickname])) with spill
    // ref B2:B61, so B5 is a spill CHILD (no <f> of its own). Writing a value
    // there is fill/template drift: it would be silently erased by the spill-range
    // strip, so the patcher must reject it — symmetric with the anchor guard above.
    const writes: CdmCellWrite[] = [
      { sheet: "Overall Ranking", ref: "B5", op: "inlineString", value: "X" },
    ];
    expect(() => patchCdmWorkbook(loadTemplate(), writes)).toThrow(/B5/);
  });

  it("throws on an unknown sheet name", () => {
    const writes = [
      { sheet: "Nonexistent Sheet", ref: "A1", op: "number", value: 1 },
    ] as unknown as CdmCellWrite[];
    expect(() => patchCdmWorkbook(loadTemplate(), writes)).toThrow();
  });

  it("produces a workbook that fflate can re-open (round-trips)", () => {
    const writes: CdmCellWrite[] = [
      { sheet: "Main Hub", ref: "B2", op: "inlineString", value: "X" },
    ];
    const out = patchCdmWorkbook(loadTemplate(), writes);
    expect(() => unzipSync(out)).not.toThrow();
  });
});

describe("patchCdmWorkbook — performance smoke", () => {
  it("applies 20k ops to a real sheet within a few seconds", () => {
    // BM Qualifications (sheet6) is large (456 KB). Hammer its input columns.
    const writes: CdmCellWrite[] = [];
    for (let i = 0; i < 20000; i++) {
      // Spread writes across rows 2..481 and a handful of columns to exercise
      // both row indexing and cell insertion/parsing paths.
      const row = 2 + (i % 480);
      const cols = ["S", "T", "U", "V", "W"];
      const col = cols[i % cols.length];
      writes.push({
        sheet: "BM Qualifications",
        ref: `${col}${row}`,
        op: "number",
        value: i % 5,
      });
    }
    const start = Date.now();
    const out = patchCdmWorkbook(loadTemplate(), writes);
    const elapsed = Date.now() - start;
    expect(out.length).toBeGreaterThan(0);
    // Generous ceiling for CI; the design target is < 2s.
    expect(elapsed).toBeLessThan(5000);
  });
});
