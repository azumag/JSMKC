type AuditResult = {
  ok: boolean;
  format: 'wrangler-text' | 'cf-json-empty' | null;
};

type AuditModule = {
  assertNoPendingMigrations: (output: string) => AuditResult;
  classifyNoPendingMigrations: (output: string) => AuditResult;
};

const { assertNoPendingMigrations, classifyNoPendingMigrations } = jest.requireActual(
  '../../scripts/d1-migration-audit.cjs',
) as AuditModule;

describe('D1 migration audit parser', () => {
  it('accepts the Wrangler no-pending sentinel inside npm output', () => {
    expect(
      classifyNoPendingMigrations(`
> smkc-score-app@0.1.0 db:migrations:list
> wrangler d1 migrations list DB --remote

No migrations to apply!
`),
    ).toEqual({ ok: true, format: 'wrangler-text' });
  });

  it('accepts cf empty JSON only when it is the final meaningful line', () => {
    expect(
      classifyNoPendingMigrations(`
cf d1 migrations list <database-id>
[]
`),
    ).toEqual({ ok: true, format: 'cf-json-empty' });

    expect(classifyNoPendingMigrations(`[]\nAPI error after result`)).toEqual({
      ok: false,
      format: null,
    });
  });

  it('accepts ANSI-decorated output from either tool', () => {
    expect(classifyNoPendingMigrations('[32mNo migrations to apply![0m')).toEqual({
      ok: true,
      format: 'wrangler-text',
    });
    expect(classifyNoPendingMigrations('[36mstatus[0m\n[32m[][0m')).toEqual({
      ok: true,
      format: 'cf-json-empty',
    });
  });

  it('accepts the wrangler 4.152.0+ emoji-prefixed sentinel (regression for #4241)', () => {
    expect(
      classifyNoPendingMigrations(`
> smkc-score-app@0.1.0 db:migrations:apply
> wrangler d1 migrations apply DB --remote

✅ No migrations to apply!
`),
    ).toEqual({ ok: true, format: 'wrangler-text' });

    expect(classifyNoPendingMigrations('✅ No migrations to apply!')).toEqual({
      ok: true,
      format: 'wrangler-text',
    });
  });

  it('accepts decoration glyphs other than the checkmark, and ANSI-wrapped decoration', () => {
    expect(classifyNoPendingMigrations('⚠️ No migrations to apply!')).toEqual({
      ok: true,
      format: 'wrangler-text',
    });
    expect(classifyNoPendingMigrations('[32m✅ No migrations to apply![0m')).toEqual({
      ok: true,
      format: 'wrangler-text',
    });
  });

  it('rejects a non-empty cf migration list', () => {
    expect(classifyNoPendingMigrations('[{"Name":"0044_pending.sql"}]')).toEqual({
      ok: false,
      format: null,
    });
    expect(() => assertNoPendingMigrations('[{"Name":"0044_pending.sql"}]')).toThrow(
      'D1 migrations may remain unapplied',
    );
  });

  it('fails closed for empty or unknown output', () => {
    expect(classifyNoPendingMigrations('')).toEqual({ ok: false, format: null });
    expect(classifyNoPendingMigrations('command completed')).toEqual({ ok: false, format: null });
    expect(() => assertNoPendingMigrations('command completed')).toThrow('D1 migrations may remain unapplied');
  });
});
