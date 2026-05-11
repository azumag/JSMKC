import fs from 'fs';
import path from 'path';

const wranglerTomlPath = path.join(__dirname, '..', '..', 'wrangler.toml');
const wranglerToml = fs.readFileSync(wranglerTomlPath, 'utf8');

function r2BucketName(sectionName: string) {
  const sectionHeader = sectionName === 'production'
    ? '[[r2_buckets]]'
    : `[[env.${sectionName}.r2_buckets]]`;
  const sectionStart = wranglerToml.indexOf(sectionHeader);
  expect(sectionStart).toBeGreaterThanOrEqual(0);

  const nextSectionStart = wranglerToml.indexOf('\n[[', sectionStart + sectionHeader.length);
  const section = nextSectionStart === -1
    ? wranglerToml.slice(sectionStart)
    : wranglerToml.slice(sectionStart, nextSectionStart);
  const match = section.match(/^\s*bucket_name\s*=\s*"([^"]+)"/m);
  expect(match).not.toBeNull();
  return match?.[1];
}

describe('Wrangler R2 bucket bindings', () => {
  it('keeps preview archive E2E writes isolated from production archives', () => {
    expect(r2BucketName('production')).toBe('smkc-archives');
    expect(r2BucketName('preview')).toBe('smkc-archives-preview');
    expect(r2BucketName('preview')).not.toBe(r2BucketName('production'));
  });
});
