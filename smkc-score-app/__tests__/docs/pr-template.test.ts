import fs from 'fs';
import path from 'path';

describe('pull request template', () => {
  const templatePath = path.resolve(__dirname, '..', '..', '..', '.github', 'pull_request_template.md');
  let template: string;

  beforeAll(() => {
    template = fs.readFileSync(templatePath, 'utf8');
  });

  it('resolves the template path from this test file location', () => {
    expect(path.isAbsolute(templatePath)).toBe(true);
    expect(templatePath.endsWith(path.join('.github', 'pull_request_template.md'))).toBe(true);
  });

  it('keeps the required automation sections', () => {
    expect(template).toContain('## Summary');
    expect(template).toContain('## Issues');
    expect(template).toContain('Closes #');
    expect(template).toContain('## Validation');
  });

  it('requires authors to confirm Summary matches the actual diff', () => {
    expect(template).toContain('## PR Body Diff Check');
    expect(template).toContain('Summary only describes changes that are present in this PR diff.');
    expect(template).toContain('planned or follow-up work');
    expect(template).toContain('current-main fixes are mentioned only when they are visible in this PR diff.');
  });
});
