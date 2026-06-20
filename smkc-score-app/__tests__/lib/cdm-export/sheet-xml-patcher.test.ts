/**
 * SheetXmlPatcher unit tests (t-wada TDD).
 *
 * These tests pin the precise, byte-stable behaviour the CDM "ZIP surgery"
 * exporter relies on: only the touched <c>/<row> regions may change, every
 * other byte of the worksheet XML must be reproduced verbatim. The fixtures
 * mirror the real cell grammar found in
 * public/templates/cdm-2025-template.xlsm:
 *   - shared-string cells   <c r=".." s=".." t="s"><v>idx</v></c>
 *   - plain number cells     <c r=".." s=".."><v>38</v></c>
 *   - formula cells          <c r=".." s=".."><f>ROW()-1</f><v>1</v></c>
 *   - array-formula cells    <c r=".." cm="1" vm="1"><f t="array" ref="..">..</f><v>..</v></c>
 *   - self-closing shells    <c r=".." s=".."/>
 *   - self-closing rows      <row r=".." spans=".." ht=".."/>
 * The compact form (no inter-element whitespace) matches Excel's output.
 */
import { SheetXmlPatcher } from "@/lib/cdm-export/sheet-xml-patcher";

/**
 * Minimal but representative worksheet skeleton. It carries the worksheet
 * envelope (so serialize() must reproduce the prolog/sheetPr/dimension and the
 * trailing pageMargins exactly) plus a sheetData with a mix of cell shapes.
 */
const FIXTURE_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<dimension ref="A1:F3"/>' +
  "<sheetData>" +
  // Row 2: A2 formula cell, B2 shared string, C2 plain number, D2 array formula
  '<row r="2" spans="1:6" ht="15" customHeight="1">' +
  '<c r="A2" s="40"><f>ROW()-1</f><v>1</v></c>' +
  '<c r="B2" s="2" t="s"><v>13</v></c>' +
  '<c r="C2" s="4"><v>38</v></c>' +
  '<c r="D2" s="15" cm="1" vm="1"><f t="array" ref="D2:D5">UNIQUE(X)</f><v>#VALUE!</v></c>' +
  "</row>" +
  // Row 4: sparse columns B4 (number) and E4 (self-closing shell) — gap at C/D
  '<row r="4" spans="1:6">' +
  '<c r="B4" s="2"><v>7</v></c>' +
  '<c r="E4" s="23"/>' +
  "</row>" +
  // Row 6: self-closing empty row that must be expanded if written to
  '<row r="6" spans="1:6" ht="15" customHeight="1"/>' +
  "</sheetData>" +
  '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
  "</worksheet>";

describe("SheetXmlPatcher — byte stability", () => {
  it("serialize() returns the exact input when no ops are applied", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    expect(patcher.serialize()).toBe(FIXTURE_XML);
  });

  it("leaves untouched cells and the envelope byte-identical after one edit", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("C2", { op: "number", value: 99 });
    const out = patcher.serialize();
    // Envelope preserved verbatim.
    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true);
    expect(out).toContain(
      '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'
    );
    // Neighbours in the same row untouched, byte for byte.
    expect(out).toContain('<c r="B2" s="2" t="s"><v>13</v></c>');
    expect(out).toContain('<c r="A2" s="40"><f>ROW()-1</f><v>1</v></c>');
    // Only the target changed.
    expect(out).toContain('<c r="C2" s="4"><v>99</v></c>');
  });
});

describe("SheetXmlPatcher — number op", () => {
  it("writes <v> and preserves the existing style, removing any t attribute", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("B2", { op: "number", value: 24 }); // B2 was a shared string
    const out = patcher.serialize();
    // t="s" must be gone; style kept; numeric value written.
    expect(out).toContain('<c r="B2" s="2"><v>24</v></c>');
    expect(out).not.toContain('<c r="B2" s="2" t="s">');
  });

  it("formats numbers in plain decimal (never scientific notation)", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("C2", { op: "number", value: 11034 });
    expect(patcher.serialize()).toContain('<c r="C2" s="4"><v>11034</v></c>');

    const p2 = new SheetXmlPatcher(FIXTURE_XML);
    p2.apply("C2", { op: "number", value: 0.0000001 });
    // 1e-7 must NOT serialize as "1e-7".
    expect(p2.serialize()).toContain("<v>0.0000001</v>");
    expect(p2.serialize()).not.toContain("e-");
  });

  it("rejects non-finite numbers", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    expect(() => patcher.apply("C2", { op: "number", value: NaN })).toThrow();
    expect(() => patcher.apply("C2", { op: "number", value: Infinity })).toThrow();
  });

  it("throws (with the ref) when the target holds a formula", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    expect(() => patcher.apply("A2", { op: "number", value: 5 })).toThrow(/A2/);
    expect(() => patcher.apply("D2", { op: "number", value: 5 })).toThrow(/D2/);
  });

  it("drops vm and cm when writing a value", () => {
    // A non-formula cell carrying vm/cm (rich-value marker). number write must
    // remove those markers so the rich value index is not reused incorrectly.
    const xml =
      "<worksheet><sheetData>" +
      '<row r="3" spans="1:4"><c r="D3" s="41" t="e" vm="2"><v>#VALUE!</v></c></row>' +
      "</sheetData></worksheet>";
    const patcher = new SheetXmlPatcher(xml);
    patcher.apply("D3", { op: "number", value: 8 });
    const out = patcher.serialize();
    expect(out).toContain('<c r="D3" s="41"><v>8</v></c>');
    expect(out).not.toContain("vm=");
    expect(out).not.toContain("#VALUE!");
  });
});

describe("SheetXmlPatcher — inlineString op", () => {
  it("writes t=\"inlineStr\" with an <is><t> body, preserving style", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("B2", { op: "inlineString", value: "Mario" });
    expect(patcher.serialize()).toContain(
      '<c r="B2" s="2" t="inlineStr"><is><t>Mario</t></is></c>'
    );
  });

  it("XML-escapes &, <, >, \" and ' in the string body", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("B2", { op: "inlineString", value: `a&b<c>d"e'f` });
    expect(patcher.serialize()).toContain(
      "<is><t>a&amp;b&lt;c&gt;d&quot;e&apos;f</t></is>"
    );
  });

  it("adds xml:space=\"preserve\" when the value has leading/trailing whitespace", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("B2", { op: "inlineString", value: "  pad  " });
    expect(patcher.serialize()).toContain(
      '<is><t xml:space="preserve">  pad  </t></is>'
    );
    // No-space value must NOT get the attribute.
    const p2 = new SheetXmlPatcher(FIXTURE_XML);
    p2.apply("B2", { op: "inlineString", value: "tight" });
    expect(p2.serialize()).toContain("<is><t>tight</t></is>");
    expect(p2.serialize()).not.toContain("xml:space");
  });

  it("throws on a formula cell", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    expect(() => patcher.apply("A2", { op: "inlineString", value: "x" })).toThrow(/A2/);
  });
});

describe("SheetXmlPatcher — clearValue op", () => {
  it("drops <v> but keeps the formula, style and attributes", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("A2", { op: "clearValue" });
    // Formula + style survive; cached <v> removed.
    expect(patcher.serialize()).toContain('<c r="A2" s="40"><f>ROW()-1</f></c>');
  });

  it("drops <is> for an inline-string cell while keeping the shell", () => {
    const xml =
      "<worksheet><sheetData>" +
      '<row r="2" spans="1:2"><c r="A2" s="5" t="inlineStr"><is><t>hi</t></is></c></row>' +
      "</sheetData></worksheet>";
    const patcher = new SheetXmlPatcher(xml);
    patcher.apply("A2", { op: "clearValue" });
    // Value content gone; styled shell remains. (t may stay; the cell is empty.)
    const out = patcher.serialize();
    expect(out).not.toContain("<is>");
    expect(out).not.toContain("hi");
    expect(out).toContain('r="A2"');
  });

  it("is a no-op when the cell does not exist", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("Z99", { op: "clearValue" });
    expect(patcher.serialize()).toBe(FIXTURE_XML);
  });
});

describe("SheetXmlPatcher — overwrite ops (degraded modes)", () => {
  it("overwriteNumber replaces value AND removes the formula", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("A2", { op: "overwriteNumber", value: 42 });
    expect(patcher.serialize()).toContain('<c r="A2" s="40"><v>42</v></c>');
    expect(patcher.serialize()).not.toContain("ROW()-1");
  });

  it("overwriteString replaces a formula cell with an inline string", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("A2", { op: "overwriteString", value: "Winner" });
    const out = patcher.serialize();
    expect(out).toContain('<c r="A2" s="40" t="inlineStr"><is><t>Winner</t></is></c>');
    expect(out).not.toContain("ROW()-1");
  });
});

describe("SheetXmlPatcher — strip op", () => {
  it("removes <f>/<v>/t/cm/vm and keeps only the styled shell", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("D2", { op: "strip" }); // array-formula cell with cm/vm
    const out = patcher.serialize();
    expect(out).toContain('<c r="D2" s="15"/>');
    expect(out).not.toContain("UNIQUE(X)");
    expect(out).not.toContain("cm=");
    expect(out).not.toContain("vm=");
  });

  it("is a no-op when the cell does not exist", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("Z1", { op: "strip" });
    expect(patcher.serialize()).toBe(FIXTURE_XML);
  });
});

describe("SheetXmlPatcher — cell insertion", () => {
  it("inserts a missing cell in A1 column order within an existing row", () => {
    // Row 4 has B4 then E4; inserting C4 must land between them.
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("C4", { op: "number", value: 5 });
    const out = patcher.serialize();
    const b = out.indexOf('r="B4"');
    const c = out.indexOf('r="C4"');
    const e = out.indexOf('r="E4"');
    expect(b).toBeGreaterThan(-1);
    expect(c).toBeGreaterThan(b);
    expect(e).toBeGreaterThan(c);
    expect(out).toContain('<c r="C4"><v>5</v></c>');
  });

  it("appends a cell after the last cell when its column is highest", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("F4", { op: "inlineString", value: "tail" });
    const out = patcher.serialize();
    const e = out.indexOf('r="E4"');
    const f = out.indexOf('r="F4"');
    expect(f).toBeGreaterThan(e);
  });

  it("inserts a missing row in row order, preserving sibling rows", () => {
    // Insert row 3 between rows 2 and 4.
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("A3", { op: "number", value: 1 });
    const out = patcher.serialize();
    const r2 = out.indexOf('<row r="2"');
    const r3 = out.indexOf('<row r="3"');
    const r4 = out.indexOf('<row r="4"');
    expect(r3).toBeGreaterThan(r2);
    expect(r4).toBeGreaterThan(r3);
    expect(out).toContain('<row r="3"><c r="A3"><v>1</v></c></row>');
  });

  it("expands a self-closing row when a cell is written into it", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("B6", { op: "number", value: 3 });
    const out = patcher.serialize();
    // Original row attributes (spans/ht/customHeight) must be preserved.
    expect(out).toContain(
      '<row r="6" spans="1:6" ht="15" customHeight="1"><c r="B6"><v>3</v></c></row>'
    );
    expect(out).not.toContain('<row r="6" spans="1:6" ht="15" customHeight="1"/>');
  });

  it("appends a brand-new row beyond the last existing row", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("A9", { op: "number", value: 7 });
    const out = patcher.serialize();
    const r6 = out.indexOf('<row r="6"');
    const r9 = out.indexOf('<row r="9"');
    expect(r9).toBeGreaterThan(r6);
    expect(out).toContain('<row r="9"><c r="A9"><v>7</v></c></row>');
  });
});

describe("SheetXmlPatcher — ordering and idempotency", () => {
  it("applies multiple ops to the same ref last-write-wins", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("C2", { op: "number", value: 1 });
    patcher.apply("C2", { op: "number", value: 2 });
    patcher.apply("C2", { op: "inlineString", value: "final" });
    const out = patcher.serialize();
    // Only the final inline-string write survives in C2; no stale numeric cache.
    expect(out).toContain('<c r="C2" s="4" t="inlineStr"><is><t>final</t></is></c>');
    expect(out).not.toContain('<c r="C2" s="4"><v>1</v></c>');
    expect(out).not.toContain('<c r="C2" s="4"><v>2</v></c>');
  });

  it("serialize() is stable across repeated calls", () => {
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("C2", { op: "number", value: 5 });
    const a = patcher.serialize();
    const b = patcher.serialize();
    expect(a).toBe(b);
  });
});

describe("SheetXmlPatcher — multiple insertions keep correct row index (#2362)", () => {
  it("writes to correct rows when inserting several new rows out of order", () => {
    // Verify that row-index integrity is maintained after multiple insertions.
    // A full-map rebuild (O(n) per insert) and an incremental update (O(k) per
    // insert) must both produce the same document order — this test catches
    // a bug where the incremental path mis-maps a row number to the wrong index.
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    // Insert between existing rows 2 and 4, plus before row 2 and after row 6.
    patcher.apply("A1", { op: "number", value: 10 });
    patcher.apply("A3", { op: "number", value: 30 });
    patcher.apply("A5", { op: "number", value: 50 });
    patcher.apply("A7", { op: "number", value: 70 });
    const out = patcher.serialize();
    // Rows must appear in ascending order and carry the correct values.
    const r1 = out.indexOf('<row r="1"');
    const r2 = out.indexOf('<row r="2"');
    const r3 = out.indexOf('<row r="3"');
    const r4 = out.indexOf('<row r="4"');
    const r5 = out.indexOf('<row r="5"');
    const r6 = out.indexOf('<row r="6"');
    const r7 = out.indexOf('<row r="7"');
    expect(r1).toBeGreaterThan(-1);
    expect(r2).toBeGreaterThan(r1);
    expect(r3).toBeGreaterThan(r2);
    expect(r4).toBeGreaterThan(r3);
    expect(r5).toBeGreaterThan(r4);
    expect(r6).toBeGreaterThan(r5);
    expect(r7).toBeGreaterThan(r6);
    expect(out).toContain('<row r="1"><c r="A1"><v>10</v></c></row>');
    expect(out).toContain('<row r="3"><c r="A3"><v>30</v></c></row>');
    expect(out).toContain('<row r="5"><c r="A5"><v>50</v></c></row>');
    expect(out).toContain('<row r="7"><c r="A7"><v>70</v></c></row>');
  });

  it("can overwrite a newly inserted row after subsequent insertions shift indices", () => {
    // After inserting row 3 (between 2 and 4), inserting row 1 shifts row 3's
    // index by 1. A subsequent apply("A3", …) must still find the correct row.
    const patcher = new SheetXmlPatcher(FIXTURE_XML);
    patcher.apply("A3", { op: "number", value: 99 });
    patcher.apply("A1", { op: "number", value: 11 }); // shifts index of row 3
    patcher.apply("A3", { op: "number", value: 33 }); // must overwrite row 3, not row 4
    const out = patcher.serialize();
    expect(out).toContain('<row r="3"><c r="A3"><v>33</v></c></row>');
    expect(out).toContain('<row r="1"><c r="A1"><v>11</v></c></row>');
  });
});
