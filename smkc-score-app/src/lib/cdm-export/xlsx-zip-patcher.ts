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
 *  3. drop formula cached values from touched sheets, force a full recalculation
 *     on open and drop the now-stale calcChain so Excel rebuilds the dependency
 *     order itself;
 *  4. pass through EVERY other part (tables, richData, media, styles, metadata,
 *     sharedStrings, printerSettings, customXml, docProps, ...) byte-for-byte,
 *     keeping the original zip entry order so a diff against the template shows
 *     only the three parts we intentionally edit.
 *
 * The only parts that may differ from the template after a no-op patch are:
 *   - xl/workbook.xml          (calcPr gains fullCalcOnLoad="1")
 *   - [Content_Types].xml      (calcChain Override removed)
 *   - xl/_rels/workbook.xml.rels (calcChain Relationship removed)
 * and xl/calcChain.xml is removed entirely.
 */
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import type { CdmCellWrite, CdmSheetName } from "@/lib/cdm-export/types";
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
 * gone and touched-sheet formula caches removed, this tells Excel to rebuild
 * the dynamic-array formula web on first open.
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

/**
 * Remove stale cached formula values from a worksheet XML string while keeping
 * formulas, styles and rich-value metadata intact. The CDM template ships with
 * CDM2025 cached results in formula cells; generated workbooks must not show
 * those names/scores while Excel is deciding when to recalculate.
 */
function stripFormulaCachedValues(sheetXml: string): string {
  return sheetXml.replace(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g, (cell) => {
    if (!cell.includes("<f")) return cell;
    return cell
      .replace(/<v(?:\s*\/|>[\s\S]*?<\/v>)/g, "")
      .replace(/<is>[\s\S]*?<\/is>/g, "");
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

  // Group writes by sheet, preserving their relative order within a sheet so
  // last-write-wins is honoured by SheetXmlPatcher.
  const writesBySheet = new Map<CdmSheetName, CdmCellWrite[]>();
  for (const write of writes) {
    const path = sheetPathByName.get(write.sheet);
    if (!path) {
      throw new Error(
        `patchCdmWorkbook: unknown sheet name "${write.sheet}" — not present in workbook.xml`
      );
    }
    const list = writesBySheet.get(write.sheet);
    if (list) {
      list.push(write);
    } else {
      writesBySheet.set(write.sheet, [write]);
    }
  }

  // Patch each touched worksheet's XML in place within the parts map. The map
  // still holds verbatim bytes for everything else, which is what guarantees
  // byte-fidelity of the untouched parts.
  for (const [sheet, sheetWrites] of writesBySheet) {
    const path = sheetPathByName.get(sheet)!;
    const sheetBytes = parts[path];
    if (!sheetBytes) {
      throw new Error(`patchCdmWorkbook: worksheet part "${path}" not found in package`);
    }
    const patcher = new SheetXmlPatcher(strFromU8(sheetBytes));
    for (const write of sheetWrites) {
      // CdmCellWrite is CdmCellOp & { sheet, ref }; SheetXmlPatcher.apply takes
      // the op shape, so we pass the write through (the extra sheet/ref fields
      // are ignored by the discriminated-union switch).
      patcher.apply(write.ref, write);
    }
    parts[path] = strToU8(stripFormulaCachedValues(patcher.serialize()));
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
