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
  jest.requireActual('../../scripts/cloudflare-config-parity.cjs') as ParityModule;

// Verbatim excerpts captured from `cf v1.0.0-beta.12` on 2026-10-15. They are
// fixtures for the pure drift check, not a claim about the current CLI.
const MIGRATE_HELP = `
cf migrate [path]

Migrate a Wrangler project to cf

Positionals
  path  Path to a Wrangler configuration file                           [string]

Options
      --bundler  Bundler to use in the migrated project (defaults to vite when
                 @cloudflare/vite-plugin is declared, otherwise wrangler)
                                                   [choices: "vite", "wrangler"]
      --dry-run  Show the files that would change without writing them
                                                      [boolean] [default: false]
      --force    Run even if the Git worktree is not clean
                                                      [boolean] [default: false]
      --install  Install cf as a project dependency (use --no-install to skip)
                                                       [boolean] [default: true]
`;

const DEPLOY_HELP = `
cf deploy

Deploy a project to Cloudflare

Global flags
  -q, --quiet       Suppress non-essential output     [boolean] [default: false]
  -z, --zone        Zone ID or domain name (overrides CLOUDFLARE_ZONE_ID)
                                                                        [string]
      --profile     Use a specific auth profile                         [string]
  -m, --mode        Mode used to evaluate project configuration         [string]
      --local       Use local resource simulations    [boolean] [default: false]
      --persist-to  Directory holding local persisted state (default:
                    ~/.config/cloudflare/state)                         [string]

Options
      --prebuilt            Deploy existing Build Output Specification files
                            without building          [boolean] [default: false]
      --tag                 A tag to associate with this Worker Version [string]
      --message             A message to associate with this Worker Version
                                                                        [string]
      --secrets-file        Path to a file containing secrets to upload with the
                            version (JSON or .env format)               [string]
      --dry-run             Build a project and run checks without actually
                            uploading the Worker      [boolean] [default: false]
      --worker              Name of the Worker in the Build Output to use
                            (defaults to the default Worker)            [string]
      --dispatch-namespace  Name of a dispatch namespace to deploy the Worker to
                            (Workers for Platforms)                     [string]
      --containers-rollout  Rollout strategy for Container changes. Immediate
                            rolls out to all instances in one step; none leaves
                            deployed Containers unchanged.
                                       [choices: "immediate", "gradual", "none"]
`;

const BUILD_HELP = `
cf build

Build a project for Cloudflare

Global flags
  -q, --quiet       Suppress non-essential output     [boolean] [default: false]
  -z, --zone        Zone ID or domain name (overrides CLOUDFLARE_ZONE_ID)
                                                                        [string]
      --profile     Use a specific auth profile                         [string]
  -m, --mode        Mode used to evaluate project configuration         [string]
      --local       Use local resource simulations    [boolean] [default: false]
      --persist-to  Directory holding local persisted state (default:
                    ~/.config/cloudflare/state)                         [string]
`;

const SECRETS_UPDATE_HELP = `
cf workers secrets update <name>

Add a secret to a Worker script by creating a new version with that secret. When
changing more than one secret at a time, prefer the "Patch multiple script
secrets" API instead of changing many secrets individually.

Options
      --worker, --script-name  Name of the script.                      [string]
      --text                   The secret value to use.                 [string]
      --type                   The kind of resource that the binding provides.
                                 [string] [choices: "secret_text", "secret_key"]
      --format                 Data format of the key.                  [string]
      --key-base64             Base64-encoded key data.                 [string]
      --usages                 Allowed operations with the key.           [array]
      --dry-run                Validate and show what would happen without
                            executing              [boolean] [default: false]
      --body                   A secret value accessible through a binding.
                                                                        [string]
`;

const TYPES_HELP = `
cf workers types

Generate types from cloudflare.config.ts

Global flags
  -q, --quiet       Suppress non-essential output     [boolean] [default: false]
  -z, --zone        Zone ID or domain name (overrides CLOUDFLARE_ZONE_ID)
                                                                        [string]
      --profile     Use a specific auth profile                         [string]
  -m, --mode        Mode used to evaluate project configuration         [string]

Options
      --include-runtime  Include Cloudflare Workers runtime types
                                                       [boolean] [default: true]
`;

const ROOT_HELP = `
cf <command> [options]

The Cloudflare CLI - manage your Cloudflare resources

Commands
  cf d1                        D1 is Cloudflare's managed, serverless database
  cf migrate [path]            Migrate a Wrangler project to cf
  cf observability             observability
  cf workers                   workers

Global flags
  -q, --quiet       Suppress non-essential output     [boolean] [default: false]
  -m, --mode        Mode used to evaluate project configuration         [string]
  --local           Use local resource simulations    [boolean] [default: false]
`;

function surface(key: string): ParitySurface {
  const found = PARITY_SURFACES.find((entry) => entry.key === key);
  if (!found) throw new Error(`unknown parity surface ${key}`);
  return found;
}

describe('cloudflare cf Worker-configuration parity record', () => {
  it('records every #4201 configuration surface with evidence and observed behaviour', () => {
    expect(PARITY_SURFACES.map((entry) => entry.key)).toEqual([
      'wrangler-config-migration',
      'environment-selection',
      'worker-deploy',
      'worker-build',
      'worker-secrets',
      'worker-types',
      'worker-logs',
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
    expect(surface('worker-logs').cfCommand).toBeNull();
    expect(surface('worker-logs').blockingReasons).toEqual(['no-cf-equivalent']);

    for (const entry of PARITY_SURFACES.filter((item) => item.cfCommand !== null)) {
      expect(entry.cfCommand).toContain('cf ');
      expect(entry.cfCommand).not.toContain('--env');
    }
  });

  it('locks the migrations_dir loss that keeps the config migration on Wrangler', () => {
    const migration = surface('wrangler-config-migration');
    expect(migration.blockingReasons).toContain('migrations-dir-not-migrated');
    expect(migration.observed.join(' ')).toContain('migrations_dir');
  });

  it('locks the unknown-mode fallback that keeps environment selection on Wrangler', () => {
    const selection = surface('environment-selection');
    expect(selection.absentFlags).toEqual(['--env']);
    expect(selection.blockingReasons).toContain('unknown-mode-silently-defaults');
    expect(selection.observed.join(' ')).toContain('default:');
    expect(selection.observed.join(' ')).toContain('No environment found in configuration with name');
  });

  it('records that the secrets command was renamed rather than kept', () => {
    const secrets = surface('worker-secrets');
    expect(secrets.cfCommand).toContain('cf workers secrets update');
    expect(secrets.blockingReasons).toContain('secret-command-renamed');
    expect(secrets.observed.join(' ')).toContain('no `put`');
  });

  it('parses the real cf version banner and rejects unknown text', () => {
    expect(parseCfVersion('🍊☁️  cf · v1.0.0-beta.12\n─────────────────────────')).toBe(VERIFIED_TOOLS.cf);
    expect(parseCfVersion('command not found')).toBeNull();
  });

  it('accepts the captured help text of every recorded surface', () => {
    expect(verifyHelpOutput(MIGRATE_HELP, surface('wrangler-config-migration')).ok).toBe(true);
    expect(verifyHelpOutput(DEPLOY_HELP, surface('worker-deploy')).ok).toBe(true);
    expect(verifyHelpOutput(DEPLOY_HELP, surface('environment-selection')).ok).toBe(true);
    expect(verifyHelpOutput(BUILD_HELP, surface('worker-build')).ok).toBe(true);
    expect(verifyHelpOutput(SECRETS_UPDATE_HELP, surface('worker-secrets')).ok).toBe(true);
    expect(verifyHelpOutput(TYPES_HELP, surface('worker-types')).ok).toBe(true);
    expect(verifyHelpOutput(ROOT_HELP, surface('worker-logs')).ok).toBe(true);
  });

  it('fails closed when a required flag disappears or an unsupported one appears', () => {
    const migration = surface('wrangler-config-migration');
    expect(verifyHelpOutput(MIGRATE_HELP.replace('--dry-run', '--simulate'), migration)).toMatchObject({
      ok: false,
      missing: ['--dry-run'],
    });

    const deploy = surface('worker-deploy');
    expect(verifyHelpOutput(`${DEPLOY_HELP}\n      --env preview  Target environment`, deploy)).toMatchObject({
      ok: false,
      unexpected: ['--env'],
    });

    const logs = surface('worker-logs');
    expect(verifyHelpOutput(`${ROOT_HELP}\n  cf tail  Stream logs`, logs)).toMatchObject({
      ok: false,
      unexpected: ['tail'],
    });
  });

  it('only ever spawns read-only help commands', () => {
    for (const entry of PARITY_SURFACES) {
      const args = readOnlyArgs(entry);
      expect(args[args.length - 1]).toBe('--help');
      expect(args.filter((arg) => arg.startsWith('--'))).toEqual(['--help']);
    }
  });

  it('keeps the parity document in step with the recorded surfaces', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'cloudflare-config-cf-parity.md'), 'utf8');
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
    const doc = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'cloudflare-config-cf-parity.md'), 'utf8');
    expect(doc.replace(/\s+/g, ' ')).toContain('every surface above stays on Wrangler');
  });
});
