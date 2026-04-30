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
});
