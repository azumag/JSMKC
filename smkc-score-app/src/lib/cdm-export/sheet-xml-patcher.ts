/**
 * SheetXmlPatcher — surgical, byte-stable editing of an Excel worksheet XML.
 *
 * Why a string/region patcher instead of a DOM:
 * The CDM template (public/templates/cdm-2025-template.xlsm) is a fully
 * formula-driven workbook. Re-serialising it through a generic XML/DOM library
 * reorders attributes, drops namespaces and rewrites whitespace, which is what
 * destroyed the dynamic-array formula web in the previous SheetJS-based export.
 * This patcher therefore keeps the original worksheet string intact and only
 * rebuilds the exact <c> (cell) substrings it has to change. Untouched cells
 * and the whole worksheet envelope (prolog, sheetPr, cols, pageMargins, tables…)
 * are emitted as verbatim byte slices of the input — so `serialize()` of an
 * unmodified patcher is identical to the input, and a single edit changes only
 * that one cell's bytes.
 *
 * Strategy:
 *  - Parse once: locate <sheetData>…</sheetData>, then index every <row> and,
 *    lazily, the cells inside a row only when that row is first written to.
 *  - apply(): record the desired op per cell ref. O(1) amortised; no full-string
 *    scan per op (the design budgets tens of thousands of ops per sheet).
 *  - serialize(): one pass. For each region (pre-sheetData, each row, gaps,
 *    post-sheetData) emit either the original slice (if untouched) or a rebuilt
 *    string (if any cell/row in it changed). New rows/cells are inserted in
 *    A1 order.
 *
 * The cell/row grammar handled matches what Excel emits and what the template
 * actually contains (verified against the real file):
 *   <c r="B2" s="2" t="s"><v>13</v></c>           shared string
 *   <c r="C2" s="4"><v>38</v></c>                  number
 *   <c r="A2" s="40"><f>ROW()-1</f><v>1</v></c>    formula
 *   <c r="D2" cm="1" vm="1"><f t="array" ref="..">..</f><v>..</v></c>
 *   <c r="E4" s="23"/>                              self-closing styled shell
 *   <row r="6" spans="1:6" ht="15" customHeight="1"/>  self-closing empty row
 */
import type { CdmCellOp } from "@/lib/cdm-export/types";

/** Parse "B12" → { col: 2, row: 12 }. Column letters are case-insensitive. */
function parseRef(ref: string): { col: number; row: number } {
  const match = /^([A-Za-z]+)(\d+)$/.exec(ref);
  if (!match) {
    throw new Error(`SheetXmlPatcher: invalid cell reference "${ref}"`);
  }
  let col = 0;
  const letters = match[1].toUpperCase();
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return { col, row: Number(match[2]) };
}

/** Escape a string for inclusion in XML text/attribute content. */
function escapeXml(value: string): string {
  // Order matters: ampersand first so the entities we insert are not re-escaped.
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Render a JS number as Excel-compatible plain decimal.
 * Excel stores numbers as decimal text and never as scientific notation, so we
 * reject non-finite values and expand any exponential form JS would produce.
 */
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`SheetXmlPatcher: non-finite number ${value}`);
  }
  const text = String(value);
  if (!/[eE]/.test(text)) {
    return text;
  }
  // Expand exponential notation (e.g. 1e-7 → 0.0000001). 20 fractional digits
  // is Excel's display ceiling and is plenty for the integer-ish values the CDM
  // sheet uses (times, scores, counts). Trim trailing zeros for stability.
  let expanded = value.toFixed(20);
  if (expanded.includes(".")) {
    expanded = expanded.replace(/0+$/, "").replace(/\.$/, "");
  }
  return expanded;
}

/**
 * The attributes of a <c> element, parsed from its start tag. We keep them as
 * an ordered list so the original attribute order/spelling is reproduced for
 * untouched-but-rebuilt cells, while still allowing targeted add/remove.
 */
interface CellAttrs {
  /** r is always present and never mutated (it is the cell address). */
  r: string;
  s?: string;
  t?: string;
  cm?: string;
  vm?: string;
}

/** A single cell, either parsed from the source or freshly created. */
interface CellModel {
  col: number;
  attrs: CellAttrs;
  /** Inner XML between <c …> and </c>; undefined for a self-closing shell. */
  inner: string | undefined;
  /** Verbatim source slice for an unmodified existing cell (fast path). */
  raw?: string;
  /** Set once the cell has been mutated; raw must then be ignored. */
  dirty: boolean;
}

/** A row of the worksheet, parsed lazily. */
interface RowModel {
  row: number;
  /** The "<row …>" start tag (without the closing ">"); used when rebuilding. */
  startTag: string;
  /** Verbatim source slice of the whole row; undefined for newly created rows. */
  raw?: string;
  /** Parsed cells, indexed and sorted lazily on first write to the row. */
  cells?: CellModel[];
  /** True once any cell in this row changed and the row must be rebuilt. */
  dirty: boolean;
}

const ROW_OPEN = "<row";
const ROW_CLOSE = "</row>";

export class SheetXmlPatcher {
  /** Bytes before "<sheetData…" (prolog + sheet header), emitted verbatim. */
  private readonly prefix: string;
  /** Bytes from "</sheetData>" onward, emitted verbatim. */
  private readonly suffix: string;
  /** The exact "<sheetData …>" open tag (handles attributes if present). */
  private readonly sheetDataOpen: string;
  /** Whether the source had an empty <sheetData/> (no rows, no close tag). */
  private readonly emptySheetData: boolean;
  /** Rows in document order. */
  private readonly rows: RowModel[];
  /** row number → index in `rows`, for O(1) lookup and ordered insertion. */
  private readonly rowIndex = new Map<number, number>();

  constructor(sheetXml: string) {
    // Locate the sheetData container. Excel always emits <sheetData> for a
    // worksheet that has cells; an entirely empty sheet may use <sheetData/>.
    const openSelfClose = sheetXml.indexOf("<sheetData/>");
    if (openSelfClose !== -1) {
      this.prefix = sheetXml.slice(0, openSelfClose);
      this.suffix = sheetXml.slice(openSelfClose + "<sheetData/>".length);
      this.sheetDataOpen = "<sheetData>";
      this.emptySheetData = true;
      this.rows = [];
      return;
    }

    const openStart = sheetXml.indexOf("<sheetData");
    if (openStart === -1) {
      throw new Error("SheetXmlPatcher: <sheetData> not found");
    }
    const openEnd = sheetXml.indexOf(">", openStart);
    const closeStart = sheetXml.indexOf("</sheetData>", openEnd);
    if (closeStart === -1) {
      throw new Error("SheetXmlPatcher: </sheetData> not found");
    }
    this.prefix = sheetXml.slice(0, openStart);
    this.sheetDataOpen = sheetXml.slice(openStart, openEnd + 1);
    this.suffix = sheetXml.slice(closeStart); // includes "</sheetData>"
    this.emptySheetData = false;

    this.rows = [];
    this.indexRows(sheetXml.slice(openEnd + 1, closeStart));
  }

  /**
   * Single pass over the sheetData body splitting it into <row> regions.
   * Cells inside a row are NOT parsed here — that work is deferred to the first
   * write into the row, keeping construction linear and cheap even for the
   * largest sheets (hundreds of KB) when only a few rows are touched.
   */
  private indexRows(body: string): void {
    let pos = 0;
    while (pos < body.length) {
      const rowStart = body.indexOf(ROW_OPEN, pos);
      if (rowStart === -1) break;
      const tagEnd = body.indexOf(">", rowStart);
      const startTag = body.slice(rowStart, tagEnd); // no trailing ">"
      const selfClosing = body[tagEnd - 1] === "/";

      let rowEnd: number;
      if (selfClosing) {
        rowEnd = tagEnd + 1; // past ">"
      } else {
        const close = body.indexOf(ROW_CLOSE, tagEnd);
        rowEnd = close + ROW_CLOSE.length;
      }

      const raw = body.slice(rowStart, rowEnd);
      const rowNum = this.extractRowNumber(startTag);
      this.rowIndex.set(rowNum, this.rows.length);
      this.rows.push({
        row: rowNum,
        // For a self-closing row, normalise the start tag to a non-self-closing
        // form so we can append cells if needed; the "/" is dropped here and
        // re-added on serialize only if the row stays empty.
        startTag: selfClosing ? startTag.slice(0, -1) : startTag,
        raw,
        dirty: false,
      });
      pos = rowEnd;
    }
  }

  private extractRowNumber(startTag: string): number {
    const m = /\br="(\d+)"/.exec(startTag);
    if (!m) {
      throw new Error(`SheetXmlPatcher: <row> without r attribute: ${startTag}`);
    }
    return Number(m[1]);
  }

  /**
   * Apply a single op to a cell. Ops are applied in call order; a later op on
   * the same ref overwrites the earlier result (last-write-wins) because each
   * op mutates the live cell model in place.
   */
  apply(ref: string, op: CdmCellOp): void {
    const { col, row } = parseRef(ref);

    // For ops that are no-ops on missing cells, avoid materialising the row.
    const cellMustExist = op.op === "clearValue" || op.op === "strip";

    let rowModel = this.getRow(row);
    if (!rowModel) {
      if (cellMustExist) return; // no-op
      rowModel = this.insertRow(row);
    }

    this.ensureRowParsed(rowModel);
    let cell = rowModel.cells!.find((c) => c.col === col);
    if (!cell) {
      if (cellMustExist) return; // no-op
      cell = this.insertCell(rowModel, ref, col);
    }

    this.applyToCell(cell, ref, op);
    cell.dirty = true;
    rowModel.dirty = true;
  }

  private getRow(row: number): RowModel | undefined {
    const idx = this.rowIndex.get(row);
    return idx === undefined ? undefined : this.rows[idx];
  }

  /** Insert a new empty row keeping rows sorted by row number. */
  private insertRow(row: number): RowModel {
    const model: RowModel = {
      row,
      startTag: `<row r="${row}"`,
      cells: [],
      dirty: true,
    };
    // Find the first existing row with a greater number and splice before it.
    let insertAt = this.rows.length;
    for (let i = 0; i < this.rows.length; i++) {
      if (this.rows[i].row > row) {
        insertAt = i;
        break;
      }
    }
    this.rows.splice(insertAt, 0, model);
    // Indices shifted; rebuild the row index map for correctness.
    this.reindexRows();
    return model;
  }

  private reindexRows(): void {
    this.rowIndex.clear();
    for (let i = 0; i < this.rows.length; i++) {
      this.rowIndex.set(this.rows[i].row, i);
    }
  }

  /** Insert a new cell into a parsed row, keeping cells sorted by column. */
  private insertCell(rowModel: RowModel, ref: string, col: number): CellModel {
    const cell: CellModel = {
      col,
      attrs: { r: ref },
      inner: "",
      dirty: true,
    };
    const cells = rowModel.cells!;
    let insertAt = cells.length;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].col > col) {
        insertAt = i;
        break;
      }
    }
    cells.splice(insertAt, 0, cell);
    return cell;
  }

  /**
   * Parse the cells of a row on first write. Existing cells keep their verbatim
   * `raw` slice so untouched cells in a rebuilt row are reproduced byte-exact.
   */
  private ensureRowParsed(rowModel: RowModel): void {
    if (rowModel.cells) return;
    const cells: CellModel[] = [];
    const raw = rowModel.raw ?? "";
    // The row inner content lies between the start tag's ">" and "</row>".
    const tagEnd = raw.indexOf(">");
    const inner = raw.slice(tagEnd + 1, raw.length - ROW_CLOSE.length);

    let pos = 0;
    while (pos < inner.length) {
      const cStart = inner.indexOf("<c", pos);
      if (cStart === -1) break;
      const cTagEnd = inner.indexOf(">", cStart);
      const selfClosing = inner[cTagEnd - 1] === "/";
      let cEnd: number;
      if (selfClosing) {
        cEnd = cTagEnd + 1;
      } else {
        const close = inner.indexOf("</c>", cTagEnd);
        cEnd = close + "</c>".length;
      }
      const rawCell = inner.slice(cStart, cEnd);
      const startTag = inner.slice(
        cStart,
        selfClosing ? cTagEnd - 1 : cTagEnd
      ); // attributes region without ">" or "/>"
      const attrs = this.parseCellAttrs(startTag);
      const innerXml = selfClosing
        ? undefined
        : inner.slice(cTagEnd + 1, cEnd - "</c>".length);
      cells.push({
        col: parseRef(attrs.r).col,
        attrs,
        inner: innerXml,
        raw: rawCell,
        dirty: false,
      });
      pos = cEnd;
    }
    rowModel.cells = cells;
  }

  /** Parse the attribute string of a <c …> start tag into a CellAttrs. */
  private parseCellAttrs(startTag: string): CellAttrs {
    const read = (name: string): string | undefined => {
      const m = new RegExp(`\\b${name}="([^"]*)"`).exec(startTag);
      return m ? m[1] : undefined;
    };
    const r = read("r");
    if (!r) {
      throw new Error(`SheetXmlPatcher: <c> without r attribute: ${startTag}`);
    }
    return { r, s: read("s"), t: read("t"), cm: read("cm"), vm: read("vm") };
  }

  /** Mutate a cell model according to the op (validation included). */
  private applyToCell(cell: CellModel, ref: string, op: CdmCellOp): void {
    const hasFormula = cell.inner !== undefined && cell.inner.includes("<f");

    switch (op.op) {
      case "number":
      case "inlineString": {
        // Guard: writing a value over a formula cell would silently corrupt the
        // template's dynamic-array web (the exact failure of the old exporter).
        if (hasFormula) {
          throw new Error(
            `SheetXmlPatcher: refusing to write a value over the formula cell ${ref}; ` +
              `the fill map disagrees with the template`
          );
        }
        // Drop rich-value markers; they index a value we are replacing.
        delete cell.attrs.cm;
        delete cell.attrs.vm;
        if (op.op === "number") {
          delete cell.attrs.t; // number is the default (no t attribute)
          cell.inner = `<v>${formatNumber(op.value)}</v>`;
        } else {
          cell.attrs.t = "inlineStr";
          cell.inner = renderInlineString(op.value);
        }
        return;
      }
      case "clearValue": {
        // Keep formula, style and attributes; remove only the cached value.
        // [\s\S] is used instead of the dotAll (`/s`) flag so the pattern still
        // spans newlines (an <is> value can contain line breaks) while staying
        // compilable under the project's ES2017 target (the `/s` flag is only
        // recognised by tsc from ES2018 onward — TS1501).
        if (cell.inner !== undefined) {
          cell.inner = cell.inner
            .replace(/<v>[\s\S]*?<\/v>/, "")
            .replace(/<is>[\s\S]*?<\/is>/, "");
        }
        return;
      }
      case "overwriteNumber":
      case "overwriteString": {
        // Degraded modes: replace value AND remove any formula.
        delete cell.attrs.cm;
        delete cell.attrs.vm;
        if (op.op === "overwriteNumber") {
          delete cell.attrs.t;
          cell.inner = `<v>${formatNumber(op.value)}</v>`;
        } else {
          cell.attrs.t = "inlineStr";
          cell.inner = renderInlineString(op.value);
        }
        return;
      }
      case "strip": {
        // Reduce to a styled empty shell: drop formula, value, t/cm/vm.
        delete cell.attrs.t;
        delete cell.attrs.cm;
        delete cell.attrs.vm;
        cell.inner = undefined;
        return;
      }
      default: {
        // Exhaustiveness guard.
        const never: never = op;
        throw new Error(`SheetXmlPatcher: unknown op ${JSON.stringify(never)}`);
      }
    }
  }

  /** Serialise one cell model back to XML (verbatim if clean, rebuilt if dirty). */
  private serializeCell(cell: CellModel): string {
    if (!cell.dirty && cell.raw !== undefined) {
      return cell.raw;
    }
    // Rebuild the start tag preserving the canonical attribute order
    // r, s, t, cm, vm — matching how Excel writes these on input cells.
    let tag = `<c r="${cell.attrs.r}"`;
    if (cell.attrs.s !== undefined) tag += ` s="${cell.attrs.s}"`;
    if (cell.attrs.t !== undefined) tag += ` t="${cell.attrs.t}"`;
    if (cell.attrs.cm !== undefined) tag += ` cm="${cell.attrs.cm}"`;
    if (cell.attrs.vm !== undefined) tag += ` vm="${cell.attrs.vm}"`;
    if (cell.inner === undefined || cell.inner === "") {
      return `${tag}/>`;
    }
    return `${tag}>${cell.inner}</c>`;
  }

  /** Serialise one row, verbatim when untouched. */
  private serializeRow(rowModel: RowModel): string {
    if (!rowModel.dirty && rowModel.raw !== undefined) {
      return rowModel.raw;
    }
    const cells = rowModel.cells ?? [];
    if (cells.length === 0) {
      // No cells: emit a self-closing row, reusing the original attributes.
      return `${rowModel.startTag}/>`;
    }
    let out = `${rowModel.startTag}>`;
    for (const cell of cells) {
      out += this.serializeCell(cell);
    }
    out += ROW_CLOSE;
    return out;
  }

  serialize(): string {
    if (this.rows.length === 0) {
      // Nothing was ever inserted; reproduce the original (possibly empty) body.
      if (this.emptySheetData) {
        return `${this.prefix}<sheetData/>${this.suffix}`;
      }
      return `${this.prefix}${this.sheetDataOpen}${this.suffix}`;
    }
    const parts: string[] = [this.prefix, this.sheetDataOpen];
    for (const rowModel of this.rows) {
      parts.push(this.serializeRow(rowModel));
    }
    parts.push(this.suffix);
    return parts.join("");
  }
}

/**
 * Render an inline-string body: <is><t>…</t></is>, adding xml:space="preserve"
 * when leading/trailing whitespace would otherwise be collapsed by Excel.
 */
function renderInlineString(value: string): string {
  const escaped = escapeXml(value);
  const needsPreserve = /^\s|\s$/.test(value);
  const t = needsPreserve ? `<t xml:space="preserve">${escaped}</t>` : `<t>${escaped}</t>`;
  return `<is>${t}</is>`;
}
