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

  it('accepts the Wrangler sentinel when it carries a leading status emoji', () => {
    expect(
      classifyNoPendingMigrations(`
 wrangler 4.152.0
✅ No migrations to apply!
`),
    ).toEqual({ ok: true, format: 'wrangler-text' });
    expect(classifyNoPendingMigrations('✅ No migrations to apply!')).toEqual({
      ok: true,
      format: 'wrangler-text',
    });
  });

  it('rejects the sentinel when it is not a whole line', () => {
    expect(classifyNoPendingMigrations('Error: No migrations to apply! please retry')).toEqual({
      ok: false,
      format: null,
    });
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
    expect(classifyNoPendingMigrations('\u001b[32mNo migrations to apply!\u001b[0m')).toEqual({
      ok: true,
      format: 'wrangler-text',
    });
    expect(classifyNoPendingMigrations('\u001b[36mstatus\u001b[0m\n\u001b[32m[]\u001b[0m')).toEqual({
      ok: true,
      format: 'cf-json-empty',
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
