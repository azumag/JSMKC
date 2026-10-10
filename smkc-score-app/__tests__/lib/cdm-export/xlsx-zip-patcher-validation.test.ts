import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { patchCdmWorkbook } from '@/lib/cdm-export/xlsx-zip-patcher';
import type { CdmCellWrite } from '@/lib/cdm-export/types';

function template(): Uint8Array {
  return zipSync(
    {
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Main Hub" r:id="r1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8(
        '<Relationships><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      '[Content_Types].xml': strToU8('<Types/>'),
      'xl/worksheets/sheet1.xml': strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1"><f t="array" ref="A1:B2">SEQUENCE(2,2)</f><v>1</v></c><c r="B1"><v>2</v></c><c r="C1"><v>9</v></c></row><row r="2"><c r="A2"><v>3</v></c><c r="B2"><v>4</v></c></row></sheetData></worksheet>',
      ),
    },
    { mtime: new Date('1980-01-01T00:00:00Z') },
  );
}

function sheet(writes: CdmCellWrite[]): string {
  return strFromU8(unzipSync(patchCdmWorkbook(template(), writes))['xl/worksheets/sheet1.xml']);
}

describe('patchCdmWorkbook — validation reused per sheet', () => {
  it.each(['number', 'overwriteNumber'] as const)('still rejects %s into an active spill child', (op) => {
    expect(() => sheet([{ sheet: 'Main Hub', ref: 'B2', op, value: 42 }])).toThrow(/spill cell Main Hub!B2/);
  });

  it('still rejects an ordinary value write into a formula anchor', () => {
    expect(() => sheet([{ sheet: 'Main Hub', ref: 'A1', op: 'number', value: 42 }])).toThrow();
  });

  it.each([
    { sheet: 'Main Hub', ref: 'A1', op: 'overwriteNumber', value: 7 },
    { sheet: 'Main Hub', ref: 'A1', op: 'overwriteString', value: 'seven' },
    { sheet: 'Main Hub', ref: 'A1', op: 'strip' },
  ] satisfies CdmCellWrite[])('allows spill-child values when $op disables the anchor in either order', (anchor) => {
    const child: CdmCellWrite = { sheet: 'Main Hub', ref: 'B2', op: 'number', value: 42 };
    for (const writes of [
      [anchor, child],
      [child, anchor],
    ]) {
      expect(sheet(writes)).toContain('<c r="B2"><v>42</v></c>');
    }
  });

  it('keeps the later duplicate write', () => {
    expect(
      sheet([
        { sheet: 'Main Hub', ref: 'C1', op: 'number', value: 1 },
        { sheet: 'Main Hub', ref: 'C1', op: 'inlineString', value: 'last' },
      ]),
    ).toContain('<c r="C1" t="inlineStr"><is><t>last</t></is></c>');
  });

  it('still rejects unknown sheets and invalid refs', () => {
    expect(() => sheet([{ sheet: 'Unknown' as CdmCellWrite['sheet'], ref: 'C1', op: 'number', value: 1 }])).toThrow(
      /unknown sheet/,
    );
    expect(() => sheet([{ sheet: 'Main Hub', ref: 'invalid', op: 'number', value: 1 }])).toThrow();
  });
});
