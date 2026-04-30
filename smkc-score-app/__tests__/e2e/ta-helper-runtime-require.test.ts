import { spawnSync } from 'child_process';
import path from 'path';

describe('TA E2E TypeScript helper runtime require', () => {
  it('resolves extensionless .ts helpers after registering ts-node', () => {
    const appDir = path.resolve(__dirname, '../..');
    const script = [
      "require('ts-node/register/transpile-only')",
      "const layout = require('./e2e/lib/layout-assertions')",
      "const phase = require('./e2e/lib/ta-phase-assertions')",
      "if (typeof layout.assertStackedCardBoxes !== 'function') process.exit(2)",
      "if (typeof phase.assertTaPhaseSubmitAccepted !== 'function') process.exit(3)",
    ].join(';');

    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: appDir,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('keeps helper resolution covered by Jest instead of the TA E2E suite', async () => {
    const taSuite = await import('../../e2e/tc-ta.js') as {
      getSuite: () => { tests: Array<{ name: string }> };
      runTc926?: unknown;
    };

    expect(taSuite.getSuite().tests.map((test) => test.name)).not.toContain('TC-926');
    expect(taSuite.runTc926).toBeUndefined();
  });
});
