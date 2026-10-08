import fs from 'fs';
import path from 'path';

type ParitySurface = {
  key: string;
  label: string;
  wranglerCommand: string;
  cfCommand: string | null;
  helpArgs: string[];
  requiredFlags: string[];
  absentFlags: string[];
  verdict: string;
  blockingReasons: string[];
  evidence: string[];
  observed: string[];
};

type ParityModule = {
  BLOCKING_REASONS: Record<string, string>;
  PARITY_SURFACES: ParitySurface[];
  VERIFIED_TOOLS: { cf: string; wrangler: string };
  parseCfVersion: (stdout: string) => string | null;
  readOnlyArgs: (surface: ParitySurface) => string[];
  verifyHelpOutput: (
    helpText: string,
    surface: ParitySurface,
  ) => {
    key: string;
    ok: boolean;
    missing: string[];
    unexpected: string[];
  };
};

const { BLOCKING_REASONS, PARITY_SURFACES, VERIFIED_TOOLS, parseCfVersion, readOnlyArgs, verifyHelpOutput } =
  jest.requireActual('../../scripts/cloudflare-cf-parity.cjs') as ParityModule;

// Verbatim excerpts captured from `cf v1.0.0-beta.12` on 2026-10-08. They are
// fixtures for the pure drift check, not a claim about the current CLI.
const APPLY_HELP = `
cf d1 migrations apply <database>

Apply any unapplied D1 migrations

Options
      --dir      Directory containing migration files (default: ./migrations)
                                                                        [string]
      --pattern  Glob for discovering migration files under --dir. Defaults to
                 "<dir>/*.sql"                                          [string]
      --table    Table recording applied migrations
                                             [string] [default: "d1_migrations"]
`;

const QUERY_HELP = `
cf d1 query <database-id>

Execute a SQL query against a D1 database and return results as objects.

Options
      --params   The params field                                        [array]
      --sql      Your SQL query. Supports multiple statements, joined by
                 semicolons, which will be executed as a batch.         [string]
      --batch    The batch field.                                        [string]
      --dry-run  Validate and show what would happen without executing
                                                      [boolean] [default: false]
`;

const D1_HELP = `
cf d1

Commands
  cf d1 create                Create D1 Database
  cf d1 delete <database-id>  Delete D1 Database
  cf d1 get <database-id>     Get D1 Database
  cf d1 list                  List D1 Databases
  cf d1 migrations            Create, list, and apply D1 database migrations
  cf d1 query <database-id>   Query D1 Database
  cf d1 raw <database-id>     Raw D1 Database query
  cf d1 time-travel           use specific point-in-time backups of your D1 database
`;

function surface(key: string): ParitySurface {
  const found = PARITY_SURFACES.find((entry) => entry.key === key);
  if (!found) throw new Error(`unknown parity surface ${key}`);
  return found;
}

describe('cloudflare cf parity record', () => {
  it('records every #4201 D1 surface with evidence and observed behaviour', () => {
    expect(PARITY_SURFACES.map((entry) => entry.key)).toEqual([
      'd1-migrations-list',
      'd1-migrations-apply',
      'd1-export',
      'preview-schema-preflight',
    ]);

    for (const entry of PARITY_SURFACES) {
      expect(entry.label).not.toBe('');
      expect(entry.wranglerCommand).toContain('wrangler');
      expect(entry.evidence.length).toBeGreaterThan(0);
      expect(entry.observed.length).toBeGreaterThan(0);
    }
  });

  it('keeps every unverified surface on Wrangler with a known reason', () => {
    for (const entry of PARITY_SURFACES) {
      expect(['keep-wrangler', 'unsupported-in-cf']).toContain(entry.verdict);
      expect(entry.blockingReasons.length).toBeGreaterThan(0);
      for (const reason of entry.blockingReasons) {
        expect(BLOCKING_REASONS[reason]).toBeTruthy();
      }
    }
  });

  it('does not claim a switch-ready surface in this slice', () => {
    expect(PARITY_SURFACES.filter((entry) => entry.verdict === 'switch-ready')).toEqual([]);
  });

  it('only names a cf command for surfaces that have one', () => {
    expect(surface('d1-export').cfCommand).toBeNull();
    expect(surface('d1-export').blockingReasons).toEqual(['no-cf-equivalent']);

    for (const entry of PARITY_SURFACES.filter((item) => item.cfCommand !== null)) {
      expect(entry.cfCommand).toContain('cf d1');
    }
  });

  it('parses the real cf version banner and rejects unknown text', () => {
    expect(parseCfVersion('🍊☁️  cf · v1.0.0-beta.12\n─────────────────────────')).toBe(VERIFIED_TOOLS.cf);
    expect(parseCfVersion('command not found')).toBeNull();
  });

  it('accepts the captured help text of every recorded surface', () => {
    expect(verifyHelpOutput(APPLY_HELP, surface('d1-migrations-apply'))).toEqual({
      key: 'd1-migrations-apply',
      ok: true,
      missing: [],
      unexpected: [],
    });
    expect(verifyHelpOutput(QUERY_HELP, surface('preview-schema-preflight')).ok).toBe(true);
    expect(verifyHelpOutput(D1_HELP, surface('d1-export')).ok).toBe(true);
  });

  it('fails closed when a required flag disappears or an unsupported one appears', () => {
    const apply = surface('d1-migrations-apply');
    expect(verifyHelpOutput(APPLY_HELP.replace('--pattern', '--glob'), apply)).toMatchObject({
      ok: false,
      missing: ['--pattern'],
    });

    const preflight = surface('preview-schema-preflight');
    expect(verifyHelpOutput(`${QUERY_HELP}\n      --json  Output JSON`, preflight)).toMatchObject({
      ok: false,
      unexpected: ['--json'],
    });

    const exportSurface = surface('d1-export');
    expect(
      verifyHelpOutput(`${D1_HELP}\n  cf d1 export <database-id>  Export D1 Database`, exportSurface),
    ).toMatchObject({ ok: false, unexpected: ['export'] });
  });

  it('only ever spawns read-only help commands', () => {
    for (const entry of PARITY_SURFACES) {
      const args = readOnlyArgs(entry);
      expect(args[args.length - 1]).toBe('--help');
      expect(args.filter((arg) => arg.startsWith('--'))).toEqual(['--help']);
    }
  });

  it('keeps the parity document in step with the recorded surfaces', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'cloudflare-d1-cf-parity.md'), 'utf8');
    // Prettier may reflow prose, so compare on collapsed whitespace.
    const normalizedDoc = doc.replace(/\s+/g, ' ');

    expect(doc).toContain(VERIFIED_TOOLS.cf);
    expect(doc).toContain(`wrangler ${VERIFIED_TOOLS.wrangler}`);

    for (const entry of PARITY_SURFACES) {
      expect(doc).toContain(`\`${entry.key}\``);
      expect(doc).toContain(entry.cfCommand ?? 'unsupported in cf');
      for (const reason of entry.blockingReasons) {
        expect(doc).toContain(`\`${reason}\``);
        expect(normalizedDoc).toContain(BLOCKING_REASONS[reason]);
      }
    }
  });

  it('states that this slice switched no production command', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'cloudflare-d1-cf-parity.md'), 'utf8');
    expect(doc.replace(/\s+/g, ' ')).toContain('still run on Wrangler');
  });
});
