import fs from 'fs';
import path from 'path';

const workflowsDir = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows');

function readWorkflows(): string {
  return fs
    .readdirSync(workflowsDir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()
    .map((name) => `# ${name}\n${fs.readFileSync(path.join(workflowsDir, name), 'utf8')}`)
    .join('\n');
}

describe('GitHub Actions JavaScript runtimes', () => {
  const workflows = readWorkflows();

  it('does not use first-party action majors that still target Node.js 20', () => {
    expect(workflows).not.toMatch(/actions\/checkout@v[1-4]\b/);
    expect(workflows).not.toMatch(/actions\/setup-node@v[1-4]\b/);
    expect(workflows).not.toMatch(/actions\/cache@v[1-4]\b/);
    expect(workflows).not.toMatch(/actions\/upload-artifact@v[1-5]\b/);
  });

  it('does not use the Node.js 20-only fountainhead wait action', () => {
    expect(workflows).not.toContain('fountainhead/action-wait-for-check@');
  });
});
