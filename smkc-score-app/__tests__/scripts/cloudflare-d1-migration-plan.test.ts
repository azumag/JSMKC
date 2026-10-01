type MigrationPlan = {
  command: 'cf';
  args: readonly string[];
  environment: 'production' | 'preview';
  operation: 'list' | 'apply';
  databaseId: string;
  migrationsDir: string;
};

type MigrationPlanModule = {
  parseCliOptions: (argv?: string[]) => { operation: string; environment: string };
  planD1Migration: (
    source: string,
    environment: 'production' | 'preview',
    operation: 'list' | 'apply',
  ) => MigrationPlan;
};

const { parseCliOptions, planD1Migration } = jest.requireActual(
  '../../scripts/cloudflare-d1-migration-plan.cjs',
) as MigrationPlanModule;

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

describe('cloudflare D1 migration command planner', () => {
  const source = configWithIds('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

  it('plans a production list command against the explicit production database ID', () => {
    expect(planD1Migration(source, 'production', 'list')).toEqual({
      command: 'cf',
      args: ['d1', 'migrations', 'list', '11111111-1111-1111-1111-111111111111'],
      environment: 'production',
      operation: 'list',
      databaseId: '11111111-1111-1111-1111-111111111111',
      migrationsDir: 'migrations',
    });
  });

  it('plans preview apply with the explicit preview database and migrations directory', () => {
    expect(planD1Migration(source, 'preview', 'apply')).toEqual({
      command: 'cf',
      args: ['d1', 'migrations', 'apply', '22222222-2222-2222-2222-222222222222', '--dir', 'migrations'],
      environment: 'preview',
      operation: 'apply',
      databaseId: '22222222-2222-2222-2222-222222222222',
      migrationsDir: 'migrations',
    });
  });

  it('never adds --local to a remote migration plan', () => {
    expect(planD1Migration(source, 'production', 'list').args).not.toContain('--local');
    expect(planD1Migration(source, 'preview', 'apply').args).not.toContain('--local');
  });

  it('rejects unsupported operations without producing a command', () => {
    expect(() => planD1Migration(source, 'production', 'delete' as 'list')).toThrow(
      'operation must be exactly "list" or "apply"',
    );
  });

  it('inherits the target resolver fail-closed boundary for unknown environments', () => {
    expect(() => planD1Migration(source, 'staging' as 'production', 'list')).toThrow(
      'environment must be exactly "production" or "preview"',
    );
  });

  it('requires exactly operation and environment CLI arguments', () => {
    expect(parseCliOptions(['list', 'production'])).toEqual({
      operation: 'list',
      environment: 'production',
    });
    expect(() => parseCliOptions(['list'])).toThrow(
      'usage: node scripts/cloudflare-d1-migration-plan.cjs <list|apply> <production|preview>',
    );
    expect(() => parseCliOptions(['list', 'production', 'extra'])).toThrow(
      'usage: node scripts/cloudflare-d1-migration-plan.cjs <list|apply> <production|preview>',
    );
  });
});
