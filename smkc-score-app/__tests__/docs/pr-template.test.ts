import fs from 'fs';
import path from 'path';

describe('pull request template', () => {
  const templatePath = path.join(process.cwd(), '..', '.github', 'pull_request_template.md');
  const template = fs.readFileSync(templatePath, 'utf8');

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
  });
});
