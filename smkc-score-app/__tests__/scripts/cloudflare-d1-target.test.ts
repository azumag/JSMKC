type D1Target = {
  environment: 'production' | 'preview';
  databaseId: string;
  migrationsDir: string;
};

type CloudflareD1TargetModule = {
  resolveD1Target: (source: string, environment: 'production' | 'preview') => D1Target;
};

const { resolveD1Target } = jest.requireActual('../../scripts/cloudflare-d1-target.cjs') as CloudflareD1TargetModule;

function configWithIds(productionId: string, previewId: string): string {
  return `
[[d1_databases]]
binding = "DB"
database_id = "${productionId}"
migrations_dir = "migrations"

[env.preview]
[[env.preview.d1_databases]]
binding = "DB"
database_id = "${previewId}"
migrations_dir = "migrations"
`;
}

describe('cloudflare D1 target resolver', () => {
  it('resolves production and preview only from their explicit DB bindings', () => {
    const source = configWithIds('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

    expect(resolveD1Target(source, 'production')).toEqual({
      environment: 'production',
      databaseId: '11111111-1111-1111-1111-111111111111',
      migrationsDir: 'migrations',
    });
    expect(resolveD1Target(source, 'preview')).toEqual({
      environment: 'preview',
      databaseId: '22222222-2222-2222-2222-222222222222',
      migrationsDir: 'migrations',
    });
  });

  it('rejects the same database UUID even when letter casing differs', () => {
    const source = configWithIds('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    expect(() => resolveD1Target(source, 'production')).toThrow(
      'production and preview DB database_id values must be distinct',
    );
  });

  it('fails closed when preview identity is missing instead of falling back to production', () => {
    const source = `
[[d1_databases]]
binding = "DB"
database_id = "11111111-1111-1111-1111-111111111111"
migrations_dir = "migrations"
`;

    expect(() => resolveD1Target(source, 'preview')).toThrow(
      'preview must define exactly one D1 binding named DB; found 0',
    );
  });

  it('rejects an unknown environment instead of selecting a default', () => {
    const source = configWithIds(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    );

    expect(() => resolveD1Target(source, 'staging' as 'production' | 'preview')).toThrow(
      'environment must be exactly "production" or "preview"',
    );
  });
});
