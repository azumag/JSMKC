import fs from 'node:fs';
import path from 'node:path';

describe('CDM archive reconcile generic error contract (issue #3570)', () => {
  const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

  it('uses common.networkError for preview/apply generic response fallbacks', () => {
    const source = read('src/components/tournament/cdm-archive-reconcile-button.tsx');

    expect(source).toContain("const tCommon = useTranslations('common')");
    expect(source).toContain("errorMessage(previewJson, tCommon('networkError'))");
    expect(source).toContain("errorMessage(applyJson, tCommon('networkError'))");
    expect(source).toContain("alert(tCommon('networkError'))");
    expect(source).not.toContain("errorMessage(previewJson, japanese ?");
    expect(source).not.toContain("errorMessage(applyJson, japanese ?");
  });

  it('keeps API-specific reconciliation errors ahead of the shared fallback', () => {
    const source = read('src/components/tournament/cdm-archive-reconcile-button.tsx');
    const docs = read('docs/cdm-archive-reconcile-client-errors.md');

    expect(source).toContain("if (typeof record.error === 'string') return record.error;");
    expect(source).toContain("if (typeof record.data?.error === 'string') return record.data.error;");
    expect(source).toContain("if (typeof record.message === 'string') return record.message;");
    expect(docs).toContain('API response の `error` / `data.error` / `message`');
    expect(docs).toContain('preview/apply failure は `common.networkError`');
  });
});
