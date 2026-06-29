/**
 * generateCdmWorkbook integration tests (t-wada TDD).
 *
 * generateCdmWorkbook is the single public entry point of the CDM exporter: it
 * concatenates every fill builder's writes (main-hub → tt-qualifications →
 * qualifications bm/mr/gp → finals bm/mr/gp → tt-finals) and patches the real
 * template once via patchCdmWorkbook. These tests run against the REAL
 * public/templates/cdm-2025-template.xlsm read from disk, because the whole
 * point of the rewrite is byte-level fidelity to that workbook — the assertions
 * below are the regression guards the old SheetJS exporter could not satisfy:
 *
 *  (a) the input cells the builders own are patched to the expected XML
 *      (Main Hub player rows, TT Qualifications times, BM Finals seed/score),
 *  (b) xl/tables/table1.xml, xl/richData/rdrichvalue.xml and xl/metadata.xml are
 *      byte-identical to the template (the parts the old exporter dropped),
 *  (c) xl/calcChain.xml is gone, xl/workbook.xml carries recalculation flags,
 *      and touched-sheet formula caches are removed.
 *
 * Two fixtures exercise the two realistic shapes: an 8-player single-round
 * tournament (BM qualification + finals winners_qf, the degraded-8 path) and a
 * 24-player playoff tournament (faithful 24 finals with typed seed cells).
 */
import { readFileSync } from "fs";
import { join } from "path";
import { unzipSync, strFromU8 } from "fflate";
import { generateCdmWorkbook } from "@/lib/cdm-export";
import type {
  CdmMatch,
  CdmModeQualification,
  CdmTournamentData,
  CdmTTEntry,
} from "@/lib/cdm-export/types";

const TEMPLATE_PATH = join(
  process.cwd(),
  "public",
  "templates",
  "cdm-2025-template.xlsm",
);

function loadTemplate(): Uint8Array {
  return new Uint8Array(readFileSync(TEMPLATE_PATH));
}

function parts(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Sheet name → part path resolution mirrors xlsx-zip-patcher (used for reads). */
const SHEET_PATHS: Record<string, string> = {
  "Main Hub": "xl/worksheets/sheet1.xml",
  "TT Qualifications": "xl/worksheets/sheet3.xml",
  "BM Finals": "xl/worksheets/sheet7.xml",
};

function readSheet(out: Uint8Array, sheetName: string): string {
  return strFromU8(parts(out)[SHEET_PATHS[sheetName]]);
}

const player = (id: string, name: string, nickname: string): CdmTTEntry["player"] => ({
  id,
  name,
  nickname,
});

/**
 * Minimal 8-player fixture: 8 BM qualifiers (groups A/B) plus an 8-player
 * winners_qf finals round. Exercises the Main Hub player rows, the BM
 * qualification block ordering and the degraded-8 finals overwrite path.
 */
function eightPlayerFixture(): CdmTournamentData {
  const names = ["Alice", "Bob", "Cara", "Dan", "Eve", "Finn", "Gus", "Hana"];
  const bmQualifications: CdmModeQualification[] = names.map((n, i) => ({
    player: player(`p${i + 1}`, n, n.toUpperCase()),
    seeding: i + 1,
    group: i % 2 === 0 ? "A" : "B",
    points: 0,
    score: 100 - i,
  }));
  const bmMatches: CdmMatch[] = [
    {
      matchNumber: 13,
      stage: "finals",
      round: "winners_qf",
      player1: player("p1", "Alice", "ALICE"),
      player2: player("p2", "Bob", "BOB"),
      score1: 5,
      score2: 3,
      completed: true,
    },
  ];
  return {
    name: "Eight Player CDM",
    date: new Date("2025-06-01"),
    bmQualifications,
    mrQualifications: [],
    gpQualifications: [],
    bmMatches,
    mrMatches: [],
    gpMatches: [],
    ttEntries: [],
    ttPhaseRounds: [],
  };
}

/**
 * 24-player playoff fixture: a single TT qualifier with a recorded time plus a
 * BM playoff_r1 match. The playoff presence selects the faithful-24 finals
 * path, so BM Finals seed cell E5 gets a typed B-position and H5 gets a score.
 */
function twentyFourPlayoffFixture(): CdmTournamentData {
  const ttEntries: CdmTTEntry[] = [
    {
      player: player("t1", "Tina", "TINA"),
      playerId: "t1",
      stage: "qualification",
      seeding: 1,
      lives: 3,
      eliminated: false,
      times: { MC1: "1:10.34" },
      totalTime: 70340,
      rank: 1,
    },
  ];
  // generatePlayoffStructure(12) playoff_r1[0] has player1Seed=11, player2Seed=10
  // (verified against double-elimination.ts), so slot1 -> B-position 12+11=23 and
  // slot2 -> B-position 12+10=22. The exporter types those B-positions into the
  // Barrage-1 block (D column, +1 seed offset => E5/E6).
  const bmMatches: CdmMatch[] = [
    {
      matchNumber: 1,
      stage: "playoff",
      round: "playoff_r1",
      player1: player("p1", "Alice", "ALICE"),
      player2: player("p2", "Bob", "BOB"),
      score1: 4,
      score2: 2,
      completed: true,
    },
  ];
  return {
    name: "Playoff CDM",
    date: new Date("2025-06-01"),
    bmQualifications: [],
    mrQualifications: [],
    gpQualifications: [],
    bmMatches,
    mrMatches: [],
    gpMatches: [],
    ttEntries,
    ttPhaseRounds: [],
  };
}

describe("generateCdmWorkbook — untouched-part fidelity", () => {
  const original = loadTemplate();
  const originalParts = parts(original);
  const out = generateCdmWorkbook(loadTemplate(), eightPlayerFixture());
  const outParts = parts(out);

  it("keeps xl/tables/table1.xml byte-identical to the template", () => {
    expect(outParts["xl/tables/table1.xml"]).toBeDefined();
    expect(
      bytesEqual(outParts["xl/tables/table1.xml"], originalParts["xl/tables/table1.xml"]),
    ).toBe(true);
  });

  it("keeps xl/richData/rdrichvalue.xml byte-identical to the template", () => {
    expect(outParts["xl/richData/rdrichvalue.xml"]).toBeDefined();
    expect(
      bytesEqual(
        outParts["xl/richData/rdrichvalue.xml"],
        originalParts["xl/richData/rdrichvalue.xml"],
      ),
    ).toBe(true);
  });

  it("keeps xl/metadata.xml byte-identical to the template", () => {
    expect(outParts["xl/metadata.xml"]).toBeDefined();
    expect(bytesEqual(outParts["xl/metadata.xml"], originalParts["xl/metadata.xml"])).toBe(true);
  });

  it("removes xl/calcChain.xml and adds full recalculation flags to workbook.xml", () => {
    expect(originalParts["xl/calcChain.xml"]).toBeDefined();
    expect(outParts["xl/calcChain.xml"]).toBeUndefined();
    const wb = strFromU8(outParts["xl/workbook.xml"]);
    expect(wb).toContain('calcMode="auto"');
    expect(wb).toContain('fullCalcOnLoad="1"');
    expect(wb).toContain('forceFullCalc="1"');
  });

  it("removes stale cached values from formula cells on touched sheets", () => {
    const bmFinals = readSheet(out, "BM Finals");
    // Formula preserved, cached <v> dropped, and the stale t="str" type marker
    // removed too (a dangling t="str" with no value makes Excel load the formula
    // as a scalar string and breaks dynamic-array spilling — see xlsx-zip-patcher).
    expect(bmFinals).toContain('<c r="BH3" s="13"><f>IF(COUNTA(AX19:AX20)');
    expect(bmFinals).not.toContain('t="str"><f>IF(COUNTA(AX19:AX20)');
    expect(bmFinals).not.toContain("<v>Sami</v>");
    expect(bmFinals).not.toContain("<v>Drew</v>");
  });
});

describe("generateCdmWorkbook — patched input cells (8-player)", () => {
  const out = generateCdmWorkbook(loadTemplate(), eightPlayerFixture());
  const mainHub = readSheet(out, "Main Hub");

  it("writes the Main Hub player names in case-insensitive name order", () => {
    // Universe is sorted by name asc: Alice .. Hana -> rows 2..9.
    expect(mainHub).toContain('<c r="B2" s="2" t="inlineStr"><is><t>Alice</t></is></c>');
    expect(mainHub).toContain('<c r="B9" s="2" t="inlineStr"><is><t>Hana</t></is></c>');
  });

  it("leaves Main Hub row 62 unwritten (template has no B62; stays absent)", () => {
    // The fixed 60-row table ends at row 61; the exporter must never address
    // row 62, so the absent template cell stays absent in the output.
    expect(mainHub).not.toContain('r="B62"');
  });
});

describe("generateCdmWorkbook — no CDM2025 template data renders anywhere", () => {
  // Distinctive nicknames baked into the real template's CDM2025 roster (verified
  // against xl/sharedStrings.xml). They reach the visible cells two ways: as
  // dynamic-array spill children (t="str" cached values, no <f>) on the
  // formula-driven sheets, and as static t="s" references in the BM/MR Finals
  // seed list. A correct export must leave NONE of them as a rendered value.
  const STALE_NICKNAMES = [
    "Bluh", "Drew", "Sami", "Ale", "Zarkov", "Kasmo", "Jarmou",
    "Patrick", "Geo", "Champix", "Onwa", "Moll", "Antistar",
  ];

  // Match one <c> element: self-closing form first + lazy attribute run so a
  // self-closing cell cannot swallow the next cell up to its </c>.
  const CELL_RE = /<c\b[^>]*?\/>|<c\b[^>]*?>[\s\S]*?<\/c>/g;

  /** Collect any cell on any worksheet that renders a stale CDM2025 nickname. */
  function staleNameOffenders(out: Uint8Array): string[] {
    const outParts = parts(out);
    // Resolve the shared-string table to dereference t="s" cells.
    const ss = strFromU8(outParts["xl/sharedStrings.xml"]);
    const sharedStrings = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
      [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""),
    );
    const stale = new Set(STALE_NICKNAMES);
    const offenders: string[] = [];
    for (const path of Object.keys(outParts)) {
      if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) continue;
      const xml = strFromU8(outParts[path]);
      for (const cell of xml.match(CELL_RE) ?? []) {
        if (cell.includes("<f")) continue; // formulas are kept; only values matter
        const t = /\bt="([^"]*)"/.exec(cell)?.[1];
        let text = "";
        if (t === "s") {
          const idx = Number(/<v>(\d+)<\/v>/.exec(cell)?.[1] ?? "-1");
          text = sharedStrings[idx] ?? "";
        } else if (t === "inlineStr") {
          text = [...cell.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("");
        } else if (t === "str") {
          text = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1] ?? "";
        }
        if (stale.has(text)) {
          offenders.push(`${path} ${/\br="([^"]*)"/.exec(cell)?.[1]}=${text}`);
        }
      }
    }
    return offenders;
  }

  // Both export shapes must be clean: the degraded-8 path (spill children +
  // overwrite/strip) and the faithful-24 playoff path (typed seed list).
  it.each([
    ["8-player degraded", eightPlayerFixture],
    ["24-player playoff", twentyFourPlayoffFixture],
  ])("renders no CDM2025 roster nickname on any sheet (%s)", (_label, fixture) => {
    expect(staleNameOffenders(generateCdmWorkbook(loadTemplate(), fixture()))).toEqual([]);
  });
});

describe("generateCdmWorkbook — patched input cells (24-player playoff)", () => {
  const out = generateCdmWorkbook(loadTemplate(), twentyFourPlayoffFixture());
  const ttQual = readSheet(out, "TT Qualifications");
  const bmFinals = readSheet(out, "BM Finals");

  it("writes the TT Qualifications MC1 time as a CDM MSSCC integer", () => {
    // 1:10.34 -> 1*10000 + 10*100 + 34 = 11034, on the single qualifier's row 2.
    expect(ttQual).toContain('<c r="G2" s="45"><v>11034</v></c>');
  });

  it("writes the BM Finals playoff seed cell and score on the faithful-24 path", () => {
    // playoff_r1[0] slot1 -> B-position 23 typed into E5; Alice's score 4 into H5.
    // slot2 -> B-position 22 into E6; Bob's score 2 into H6.
    expect(bmFinals).toContain('<c r="E5" s="27"><v>23</v></c>');
    expect(bmFinals).toContain('<c r="E6" s="27"><v>22</v></c>');
    expect(bmFinals).toContain('<c r="H5" s="3"><v>4</v></c>');
    expect(bmFinals).toContain('<c r="H6" s="3"><v>2</v></c>');
  });
});
