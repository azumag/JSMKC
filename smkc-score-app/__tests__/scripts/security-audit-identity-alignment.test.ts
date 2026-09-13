import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(__dirname, '../..');

// prettier-ignore
describe('security audit exception identity alignment', () => {
  const auditSource = fs.readFileSync(path.join(appRoot, 'scripts', 'security-audit.js'), 'utf8');
  const statusSource = fs.readFileSync(path.join(appRoot, 'scripts', 'security-audit-status.js'), 'utf8');

  it('keeps the status evidence advisory identity aligned with the blocking exception', () => {
    expect(auditSource).toContain("const ALLOWED_ADVISORY = 'GHSA-ggr8-5vv4-36mx';");
    expect(statusSource).toContain("const TRACKED_ADVISORY = 'GHSA-ggr8-5vv4-36mx';");
  });

  it('keeps the status evidence affected range aligned with the blocking exception', () => {
    expect(auditSource).toContain("const ALLOWED_ADVISORY_RANGE = '<8.0.0';");
    expect(statusSource).toContain("const TRACKED_ADVISORY_RANGE = '<8.0.0';");
  });
});
