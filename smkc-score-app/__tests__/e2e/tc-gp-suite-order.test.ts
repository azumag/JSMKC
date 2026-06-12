import { createRequire } from 'module';
import path from 'path';

type TcTestCase = {
  name: string;
};

const requireFromApp = createRequire(path.resolve(__dirname, '../../package.json'));

describe('tc-gp suite ordering', () => {
  it('keeps TC-831 and TC-832 adjacent for readable log progression', () => {
    const { getSuite } = requireFromApp('./e2e/tc-gp');
    const suite = getSuite();
    const names = suite.tests.map((entry: TcTestCase) => entry.name);

    const tc831Index = names.indexOf('TC-831');
    expect(tc831Index).toBeGreaterThanOrEqual(0);
    expect(names.slice(tc831Index, tc831Index + 2)).toEqual(['TC-831', 'TC-832']);
  });
});
