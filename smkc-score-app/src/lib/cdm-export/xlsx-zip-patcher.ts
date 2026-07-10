/**
 * patchCdmWorkbook — ZIP-surgery filler for the CDM 2025 score sheet.
 *
 * The template (public/templates/cdm-2025-template.xlsm) is a fully
 * dynamic-array-formula-driven workbook with NO VBA. Standings, bracket
 * advancement and the overall ranking are all computed by Excel formulas that
 * depend on structured-table references (Registration[...]), rich-value flag
 * images and a metadata-backed spill web. The previous exporter round-tripped
 * the file through SheetJS, which silently dropped xl/tables/* and
 * xl/richData/* and rewrote the worksheet XML, collapsing every formula to
 * #NAME?/#SPILL!.
 *
 * This module instead performs surgery on the OOXML package:
 *  1. unzip with fflate (synchronous, Workers-compatible — no streams, no fs);
 *  2. patch ONLY the input cells of the touched worksheets via SheetXmlPatcher,
 *     which rewrites just the changed <c>/<row> regions and reproduces every
 *     other byte of the sheet verbatim;
 *  3. drop stale cached results from EVERY worksheet (touched or not) — both
 *     formula cells AND the dynamic-array spill children those formulas populate
 *     (cells with no <f> of their own; see stripFormulaCachedValues) — then force
 *     a full recalculation on open and drop the now-stale calcChain so Excel
 *     rebuilds the dependency order and re-spills the values itself;
 *  4. pass through EVERY other part (tables, richData, media, styles, metadata,
 *     sharedStrings, printerSettings, customXml, docProps, ...) byte-for-byte,
 *     keeping the original zip entry order so a diff against the template shows
 *     only the worksheets plus the three calc-control parts we intentionally edit.
 *
 * The parts that may differ from the template after a no-op patch are:
 *   - xl/worksheets/sheet*.xml (stale cached formula/spill values removed; the
 *     formulas, styles and structure are otherwise byte-preserved)
 *   - xl/workbook.xml          (calcPr gains fullCalcOnLoad="1")
 *   - [Content_Types].xml      (calcChain Override removed)
 *   - xl/_rels/workbook.xml.rels (calcChain Relationship removed)
 * and xl/calcChain.xml is removed entirely. Every other (non-worksheet) part is
 * byte-identical — that fidelity is what the old SheetJS exporter could not keep.
 */
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import type { CdmCellWrite } from "@/lib/cdm-export/types";
import { SheetXmlPatcher } from "@/lib/cdm-export/sheet-xml-patcher";

/** OOXML part path of the worksheet relationship Content-Type filter. */
const WORKSHEET_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";

const CALC_CHAIN_PART = "xl/calcChain.xml";
const WORKBOOK_PART = "xl/workbook.xml";
const WORKBOOK_RELS_PART = "xl/_rels/workbook.xml.rels";
const CONTENT_TYPES_PART = "[Content_Types].xml";

/**
 * Resolve "<sheet name=..>" → "xl/worksheets/sheetN.xml" from the workbook
 * itself. The numeric sheet index is NOT positional in OOXML — a workbook's
 * Nth <sheet> may map to any sheetK.xml — so we follow r:id through
 * workbook.xml.rels rather than hard-coding sheet numbers (which would silently
 * write into the wrong sheet if the template is ever re-saved).
 */
function buildSheetPathResolver(
  workbookXml: string,
  workbookRelsXml: string
): Map<string, string> {
  // r:id → Target path (relative to xl/), worksheet relationships only.
  const ridToTarget = new Map<string, string>();
  // Each <Relationship Id=".." Type=".." Target=".."/>; attribute order varies,
  // so read attributes independently instead of assuming a fixed sequence.
  const relRegex = /<Relationship\b[^>]*\/>/g;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relRegex.exec(workbookRelsXml)) !== null) {
    const tag = relMatch[0];
    const type = readAttr(tag, "Type");
    if (type !== WORKSHEET_REL_TYPE) continue;
    const id = readAttr(tag, "Id");
    const target = readAttr(tag, "Target");
    if (id && target) {
      // Targets are relative to the xl/ folder, e.g. "worksheets/sheet1.xml".
      ridToTarget.set(id, `xl/${target}`);
    }
  }

  // sheet display name → part path, via <sheet name=".." r:id=".."/>.
  const nameToPath = new Map<string, string>();
  const sheetRegex = /<sheet\b[^>]*\/>/g;
  let sheetMatch: RegExpExecArray | null;
  while ((sheetMatch = sheetRegex.exec(workbookXml)) !== null) {
    const tag = sheetMatch[0];
    const name = readAttr(tag, "name");
    const rid = readAttr(tag, "r:id");
    if (name && rid) {
      const path = ridToTarget.get(rid);
      if (path) nameToPath.set(decodeXmlEntities(name), path);
    }
  }
  return nameToPath;
}

/** Read a double-quoted attribute value from a start-tag string, or undefined. */
function readAttr(tag: string, name: string): string | undefined {
  // Escape ":" in qualified names (r:id) for the RegExp; "\b" before a "r" in
  // "r:id" still anchors on the word boundary preceding it.
  const re = new RegExp(`\\b${name.replace(/[:.]/g, "\\$&")}="([^"]*)"`);
  const m = re.exec(tag);
  return m ? m[1] : undefined;
}

/** Decode the XML entities Excel may use inside a sheet name attribute. */
function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"); // ampersand last so we do not double-decode
}

/**
 * Set one attribute in an existing XML start-tag attribute string, preserving
 * other attributes and their order.
 */
function upsertAttr(attrs: string, name: string, value: string): string {
  const re = new RegExp(`\\b${name}="[^"]*"`);
  if (re.test(attrs)) {
    return attrs.replace(re, `${name}="${value}"`);
  }
  return `${attrs} ${name}="${value}"`;
}

/**
 * Add the recalculation attributes to <calcPr>, idempotently. With the calcChain
 * gone and every sheet's formula and spill-child caches removed, this tells Excel
 * to rebuild the dynamic-array formula web on first open.
 */
function ensureFullRecalculation(workbookXml: string): string {
  const calcPrMatch = /<calcPr\b([^>]*)\/>/.exec(workbookXml);
  if (calcPrMatch) {
    let attrs = calcPrMatch[1];
    attrs = upsertAttr(attrs, "calcMode", "auto");
    attrs = upsertAttr(attrs, "fullCalcOnLoad", "1");
    attrs = upsertAttr(attrs, "forceFullCalc", "1");
    const replacement = `<calcPr${attrs}/>`;
    return workbookXml.replace(calcPrMatch[0], replacement);
  }
  // No <calcPr> at all: insert one right after </sheets>, the schema-valid slot
  // for calcPr (CT_Workbook orders sheets before calcPr). Falling back to just
  // before </workbook> would violate the element order and can make Excel
  // repair the file, so we anchor on </sheets> instead.
  const sheetsClose = workbookXml.indexOf("</sheets>");
  if (sheetsClose !== -1) {
    const insertAt = sheetsClose + "</sheets>".length;
    return (
      workbookXml.slice(0, insertAt) +
      '<calcPr calcId="0" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>' +
      workbookXml.slice(insertAt)
    );
  }
  // Last resort: a workbook without <sheets> is malformed for our purposes.
  throw new Error("patchCdmWorkbook: workbook.xml has neither <calcPr> nor <sheets>");
}

/** A rectangular cell range (1-based, inclusive on both corners). */
interface CellRange {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

interface SpillRange extends CellRange {
  anchorCol: number;
  anchorRow: number;
}

/** Convert column letters ("A", "B", … "AA") to a 1-based column number. */
function columnLettersToNumber(letters: string): number {
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return col;
}

/** Parse an A1 ref ("B12") into 1-based {col,row}, or undefined if malformed. */
function parseA1(ref: string): { col: number; row: number } | undefined {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref);
  if (!m) return undefined;
  return { col: columnLettersToNumber(m[1].toUpperCase()), row: Number(m[2]) };
}

/** Parse an A1 range ("B2:B48" or a bare single cell "B2") into a CellRange. */
function parseRange(ref: string): CellRange | undefined {
  const [a, b] = ref.split(":");
  const start = parseA1(a);
  const end = b ? parseA1(b) : start;
  if (!start || !end) return undefined;
  return {
    minCol: Math.min(start.col, end.col),
    maxCol: Math.max(start.col, end.col),
    minRow: Math.min(start.row, end.row),
    maxRow: Math.max(start.row, end.row),
  };
}

/**
 * Collect the spill range of every dynamic-array formula in a worksheet.
 *
 * A dynamic-array (spill) formula stores its `<f>` ONLY in its anchor cell, as
 * `<c r="B2"…><f t="array" ref="B2:B48">…</f><v>…</v></c>`. The cells it spills
 * into (B3..B48) are persisted as plain cached cells with NO `<f>` of their own,
 * e.g. `<c r="B4" s="44" t="str"><v>Bluh</v></c>`. Those spill *children* are the
 * ones that carry the CDM2025 names/scores (FILTER/SORT/UNIQUE of
 * Registration[Nickname], cross-sheet XLOOKUPs, …), yet they hold no `<f>` and so
 * escape a naïve "does the cell contain <f>?" strip. We collect the anchors' ref
 * ranges here so {@link stripFormulaCachedValues} can clear the children too.
 *
 * Only `t="array"` formulas declare a spill (a stale value to drop). Shared
 * formulas (`t="shared"`) also carry a `ref`, but their member cells each keep
 * their own `<f t="shared" si=…>` and are already handled by the in-cell `<f>`
 * test, so they are deliberately excluded here.
 */
function collectSpillRanges(sheetXml: string): SpillRange[] {
  const ranges: SpillRange[] = [];
  const fTagRe = /<f\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = fTagRe.exec(sheetXml)) !== null) {
    const attrs = m[1];
    if (!/\bt="array"/.test(attrs)) continue;
    const refMatch = /\bref="([^"]*)"/.exec(attrs);
    if (!refMatch) continue;
    const range = parseRange(refMatch[1]);
    const anchor = parseA1(refMatch[1].split(":")[0]);
    if (range && anchor) {
      ranges.push({ ...range, anchorCol: anchor.col, anchorRow: anchor.row });
    }
  }
  return ranges;
}

/** True only for a spill child; the array-formula anchor itself is excluded. */
function isWithinAnySpillChild(ref: string, ranges: SpillRange[]): boolean {
  const cell = parseA1(ref);
  if (!cell) return false;
  return ranges.some((range) =>
    cell.col >= range.minCol &&
    cell.col <= range.maxCol &&
    cell.row >= range.minRow &&
    cell.row <= range.maxRow &&
    (cell.col !== range.anchorCol || cell.row !== range.anchorRow)
  );
}

/** Exhaustive classification: adding a future value op must update this guard. */
function writesCellValue(op: CdmCellWrite["op"]): boolean {
  switch (op) {
    case "number":
    case "inlineString":
    case "overwriteNumber":
    case "overwriteString":
      return true;
    case "clearValue":
    case "strip":
      return false;
    default: {
      const exhaustive: never = op;
      return exhaustive;
    }
  }
}

/** Is the A1 ref inside any of the given ranges? */
function isWithinAnyRange(ref: string, ranges: CellRange[]): boolean {
  if (ranges.length === 0) return false;
  const cell = parseA1(ref);
  if (!cell) return false;
  for (const r of ranges) {
    if (
      cell.col >= r.minCol &&
      cell.col <= r.maxCol &&
      cell.row >= r.minRow &&
      cell.row <= r.maxRow
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Remove stale cached formula values from a worksheet XML string while keeping
 * formulas, styles and rich-value metadata intact. The CDM template ships with
 * CDM2025 cached results in formula cells; generated workbooks must not show
 * those names/scores while Excel is deciding when to recalculate. Applied to
 * every worksheet in the package — the never-written sheets (Overall Ranking,
 * TT for Scoub, Parameters) carry just as much stale CDM2025 data as the ones
 * we patch, so leaving their caches would let those template-era values render
 * until the post-open recalculation catches up.
 *
 * Two kinds of cached values are dropped:
 *  1. cells that contain an `<f>` (ordinary, shared or array-anchor formulas);
 *  2. dynamic-array SPILL CHILDREN — cells with no `<f>` of their own that sit
 *     inside an anchor's spill `ref` range. These hold the bulk of the visible
 *     CDM2025 roster (the FILTER/SORT/UNIQUE spills) and, because a non-empty
 *     spill range also blocks Excel from re-spilling fresh values on open, must
 *     be cleared so the anchor can repopulate them. See {@link collectSpillRanges}.
 */
function stripFormulaCachedValues(
  sheetXml: string,
  spillRanges: SpillRange[] = collectSpillRanges(sheetXml),
): string {
  // Match one <c> element at a time. The self-closing form is listed FIRST and
  // both forms use a lazy attribute run (`[^>]*?`); otherwise a self-closing cell
  // (<c r=".." t="s"/>) would greedily swallow the following cells up to the next
  // </c>, and the per-cell ref/spill test below would then key off only the
  // leading cell — silently skipping any spill child caught inside that span.
  return sheetXml.replace(/<c\b[^>]*?\/>|<c\b[^>]*?>[\s\S]*?<\/c>/g, (cell) => {
    if (!cell.includes("<f")) {
      // Not a formula cell. Only strip it when it is a spill child of some
      // dynamic-array anchor; a true input/static cell must keep its value.
      // The cell's own address is the first r="…" in the element (a `ref="…"`
      // on a nested <f> is excluded by the \b word boundary before r).
      const refMatch = /\br="([^"]*)"/.exec(cell);
      if (!refMatch || !isWithinAnyRange(refMatch[1], spillRanges)) return cell;
    }
    return (
      cell
        .replace(/<v(?:\s*\/|>[\s\S]*?<\/v>)/g, "")
        .replace(/<is>[\s\S]*?<\/is>/g, "")
        // Drop the now-stale cached-value type from the <c> opening tag. The `t`
        // attribute records the type of the cached <v>/<is> we just removed; the
        // alternation mirrors those value forms (t="str"/"e"/"b"/"s" pair with the
        // <v> strip, "inlineStr" with the <is> strip). In this template only "str"
        // and "e" actually occur on stripped cells — the rest are kept for symmetry
        // so no value-form can ever leave a dangling type behind. "s" (shared-string
        // index) in particular should never occur here in practice: a genuine
        // static/authored cell has no <f> and sits outside every spill range, so it
        // returns early two lines above this block; a formula/spill-child cell's
        // cached type is always "str"/"e"/"b"/"inlineStr", never "s" (Excel doesn't
        // route computed results through the shared-string table). It is kept in
        // the alternation only as a defensive fallback, not because some other
        // check filters it out.
        // Left dangling it is worse than wrong: on a dynamic-array ANCHOR cell
        // Excel reads t="str" as "this formula returns a single string", loads
        // the array as a SCALAR, and never spills it — so every ANCHORARRAY()/`#`
        // reference to that anchor (the CDM sheets are whole webs of them) then
        // resolves to #NAME?. Removing it lets Excel recompute the result type on
        // open and re-establish the spill. Only the attribute run before the
        // first '>' is touched, so the formula's own <f t="array"> marker — which
        // lives after that '>' and is never in this alternation — is preserved.
        .replace(/^(<c\b[^>]*?)\s+t="(?:str|e|b|s|inlineStr)"/, "$1")
        // Drop `vm` (value metadata) too. On a rich-value cell `vm` points into
        // xl/richData at the cached linked value (the CDM2025 country flags). The
        // value we just removed is gone, but a surviving `vm` still resolves to
        // that stale flag — e.g. the UNIQUE(FILTER(Registration[Country])) spill
        // children on Main Hub (T3:T12). Stripping it makes the cell truly blank;
        // a real recalc re-establishes `vm` from the recomputed result. `cm`
        // (the dynamic-array marker) is intentionally KEPT so anchors still spill.
        .replace(/^(<c\b[^>]*?)\s+vm="\d+"/, "$1")
    );
  });
}

/**
 * Remove the calcChain Override from [Content_Types].xml. The calcChain is the
 * only part we delete, and an Override pointing at a missing part makes Excel
 * flag the package as corrupt, so the Override must go with it.
 */
function removeCalcChainOverride(contentTypesXml: string): string {
  // Match the single self-closing Override whose PartName targets calcChain.
  return contentTypesXml.replace(
    /<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/,
    ""
  );
}

/**
 * Remove the calcChain Relationship from workbook.xml.rels. Same reasoning as
 * the Content-Type Override: a dangling relationship target breaks the package.
 */
function removeCalcChainRelationship(workbookRelsXml: string): string {
  // The Relationship may declare its attributes in any order; match any
  // self-closing Relationship whose Target ends in calcChain.xml.
  return workbookRelsXml.replace(
    /<Relationship\b[^>]*Target="calcChain\.xml"[^>]*\/>/,
    ""
  );
}

/**
 * Fill the CDM template with the given cell writes and return a fresh .xlsm.
 *
 * Writes are grouped per sheet and applied to that sheet's XML in array order
 * (so a later write to the same ref wins, matching SheetXmlPatcher semantics).
 * An unknown sheet name throws — it means the fill map references a sheet the
 * template does not contain, which must never be silently ignored.
 */
export function patchCdmWorkbook(
  template: Uint8Array,
  writes: CdmCellWrite[]
): Uint8Array {
  const parts = unzipSync(template);

  const workbookBytes = parts[WORKBOOK_PART];
  const workbookRelsBytes = parts[WORKBOOK_RELS_PART];
  if (!workbookBytes || !workbookRelsBytes) {
    throw new Error("patchCdmWorkbook: template is missing workbook.xml or its rels");
  }
  const workbookXml = strFromU8(workbookBytes);
  const workbookRelsXml = strFromU8(workbookRelsBytes);

  const sheetPathByName = buildSheetPathResolver(workbookXml, workbookRelsXml);

  // Group writes by the resolved part PATH (not the sheet name), preserving
  // their relative order within a sheet so last-write-wins is honoured by
  // SheetXmlPatcher. Keying by path lets the single strip loop below find a
  // sheet's writes without a separate "touched" bookkeeping set.
  const writesByPath = new Map<string, CdmCellWrite[]>();
  for (const write of writes) {
    const path = sheetPathByName.get(write.sheet);
    if (!path) {
      throw new Error(
        `patchCdmWorkbook: unknown sheet name "${write.sheet}" — not present in workbook.xml`
      );
    }
    const list = writesByPath.get(path);
    if (list) {
      list.push(write);
    } else {
      writesByPath.set(path, [write]);
    }
  }

  // Process EVERY worksheet the workbook declares, whether or not it receives
  // cell writes. The CDM template ships with CDM2025 computed results cached
  // inside formula cells AND inside their dynamic-array spill children, and on
  // the sheets the exporter never writes to (Overall Ranking, TT for Scoub,
  // Parameters — see design §3.6) those caches would otherwise survive
  // unchanged. fullCalcOnLoad rebuilds the values once Excel recalculates, but
  // until it does Excel renders the stale template-era names/scores — exactly
  // the "only some sheets update" symptom. We therefore strip every worksheet's
  // caches, touched or not, so nothing can show a pre-computed template value on
  // open. A single pass over all paths keeps "stripped exactly once" structural.
  for (const path of new Set(sheetPathByName.values())) {
    const sheetBytes = parts[path];
    if (!sheetBytes) {
      throw new Error(`patchCdmWorkbook: worksheet part "${path}" not found in package`);
    }
    let sheetXml = strFromU8(sheetBytes);
    let reusableSpillRanges: SpillRange[] | undefined;

    const sheetWrites = writesByPath.get(path);
    if (sheetWrites) {
      // Symmetric drift guard: SheetXmlPatcher already throws when a value op
      // lands on a formula ANCHOR (a cell with its own <f>). A value op aimed at
      // a dynamic-array SPILL CHILD (no <f> of its own) would NOT throw there,
      // yet the strip below clears that whole spill range — silently erasing the
      // write. That is the same fill/template drift the anchor guard rejects, so
      // we reject it here too rather than lose data quietly. Computed on the
      // pre-patch XML because value ops never alter anchors (they would throw).
      const spillRanges = collectSpillRanges(sheetXml);
      reusableSpillRanges = spillRanges;
      for (const write of sheetWrites) {
        if (
          writesCellValue(write.op) &&
          isWithinAnySpillChild(write.ref, spillRanges)
        ) {
          throw new Error(
            `patchCdmWorkbook: refusing to write a value into the dynamic-array ` +
              `spill cell ${write.sheet}!${write.ref}; the fill map disagrees with the template`
          );
        }
      }

      const patcher = new SheetXmlPatcher(sheetXml);
      for (const write of sheetWrites) {
        // CdmCellWrite is CdmCellOp & { sheet, ref }; SheetXmlPatcher.apply takes
        // the op shape, so we pass the write through (the extra sheet/ref fields
        // are ignored by the discriminated-union switch).
        patcher.apply(write.ref, write);
      }
      sheetXml = patcher.serialize();

      /* Formula-altering ops may remove an array anchor, so only ordinary
       * input/cache writes can safely reuse the pre-patch spill analysis.
       * Degraded bracket writes deliberately recompute from post-patch XML. */
      if (sheetWrites.some((write) =>
        write.op === "overwriteNumber" ||
        write.op === "overwriteString" ||
        write.op === "strip"
      )) {
        reusableSpillRanges = undefined;
      }
    }

    // Strip on the post-patch XML so spill ranges reflect any anchors an
    // overwrite/strip op removed: a cell whose <f t="array"> was overwritten is
    // no longer in a range, so its freshly written value is preserved. (The only
    // anchors the degraded bracket modes strip are single-cell, so no multi-cell
    // anchor is ever orphaned mid-spill; revisit this if that ever changes.)
    parts[path] = strToU8(stripFormulaCachedValues(sheetXml, reusableSpillRanges));
  }

  // Force recalculation on open and remove the stale calc chain.
  // `workbookXml` is the string read before the patch loop; that is safe
  // because cell writes only ever touch worksheet parts (the loop above writes
  // back to `parts[path]` for sheet paths only), so xl/workbook.xml cannot have
  // changed in between. If a future op kind ever mutates workbook.xml, re-read
  // parts[WORKBOOK_PART] here instead of reusing this string.
  parts[WORKBOOK_PART] = strToU8(ensureFullRecalculation(workbookXml));
  parts[CONTENT_TYPES_PART] = strToU8(
    removeCalcChainOverride(strFromU8(parts[CONTENT_TYPES_PART]))
  );
  parts[WORKBOOK_RELS_PART] = strToU8(removeCalcChainRelationship(workbookRelsXml));

  // Rebuild the zip preserving the original entry order minus the dropped
  // calcChain. fflate zipSync iterates the object in insertion order, and
  // unzipSync produced `parts` in the package's entry order, so we re-key into
  // a fresh object skipping calcChain to keep ordering stable and deterministic.
  const outParts: Record<string, Uint8Array> = {};
  for (const path of Object.keys(parts)) {
    if (path === CALC_CHAIN_PART) continue; // Excel rebuilds it from fullCalcOnLoad
    outParts[path] = parts[path];
  }

  // Pin mtime to the DOS-date epoch (1980-01-01) so repeated exports of the
  // same data are byte-stable. fflate's default mtime is Date.now(), which
  // would make every export differ; 0 (1970) is outside the DOS date range, so
  // we use the earliest representable timestamp instead.
  return zipSync(outParts, { mtime: new Date("1980-01-01T00:00:00Z") });
}
