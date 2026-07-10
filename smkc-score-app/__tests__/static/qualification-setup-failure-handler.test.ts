import fs from 'node:fs';
import path from 'node:path';

describe('qualification setup failure handler', () => {
  it.each(['bm', 'mr', 'gp'])('%s delegates network setup failures to the shared hook', (mode) => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'tournaments', '[id]', mode, 'page-client.tsx'),
      'utf8',
    );

    expect(source).toContain('handleSetupFailure(err, () => setIsSetupDialogOpen(false))');
    expect(source).not.toContain("logger.error('Failed to setup:'");
  });
});
