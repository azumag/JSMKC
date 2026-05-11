import fs from 'fs';
import path from 'path';

describe('README migration guidance', () => {
  const readme = fs.readFileSync(path.join(__dirname, '../../README.md'), 'utf8');

  it('documents backtick-quoted identifiers for new Wrangler D1 migrations', () => {
    expect(readme).toContain('Wrangler-format SQL file under');
    expect(readme).toContain('avoid reserved-word conflicts');
    expect(readme).toContain('identifiers with backticks');
    expect(readme).toContain('ALTER TABLE `TableName` ADD COLUMN `columnName` TEXT;');
  });
});
