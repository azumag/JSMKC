import { createRequire } from 'module';
import path from 'path';

type TcTestCase = {
  name: string;
};

const requireFromApp = createRequire(path.join(process.cwd(), 'package.json'));

describe('tc-gp suite ordering', () => {
  it('keeps TC-831 before TC-832', () => {
    const { getSuite } = requireFromApp('./e2e/tc-gp');
    const suite = getSuite();
    const names = suite.tests.map((entry: TcTestCase) => entry.name);

    const tc831Index = names.indexOf('TC-831');
    const tc832Index = names.indexOf('TC-832');

    expect(tc831Index).toBeGreaterThanOrEqual(0); // TC-831 must exist before relying on slice()
    expect(tc832Index).toBeGreaterThan(tc831Index);
  });

  it('keeps TC-831 and TC-832 adjacent for readable log progression', () => {
    const { getSuite } = requireFromApp('./e2e/tc-gp');
    const suite = getSuite();
    const names = suite.tests.map((entry: TcTestCase) => entry.name);

    const tc831Index = names.indexOf('TC-831');
    expect(tc831Index).toBeGreaterThanOrEqual(0); // explicit guard for tc831 existence
    expect(names.slice(tc831Index, tc831Index + 2)).toEqual(['TC-831', 'TC-832']);
  });
});
