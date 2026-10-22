import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

interface WorkflowStep {
  uses?: string;
  with?: Record<string, unknown>;
}

interface WorkflowDocument {
  jobs?: Record<string, { steps?: WorkflowStep[] }>;
}

interface NodePin {
  step: string;
  version: string;
}

// Node.js 2026-10 security release (nodejs/node#66871: blocked eMudhra/emSign
// intermediate keys, #66877: NSS 3.131.1 CA store) ships in 22.23.4 / 24.22.1.
// setup-node resolves a bare "22" to the runner tool cache (22.23.3 at the time),
// so every workflow must pin one exact release that is at least the patched one.
// Only the floor is asserted, so a later 22.x bump needs no test change.
const PATCHED_NODE_22 = '22.23.4';
const PATCHED_NODE_24 = '24.22.1';

const workflowsDir = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows');
const nodeVersionFile = path.resolve(__dirname, '..', '..', '.node-version');

const isAtLeast = (version: string, floor: string): boolean => {
  const v = version.split('.').map(Number);
  const f = floor.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (v[i] !== f[i]) return v[i] > f[i];
  }
  return true;
};

// readdirSync の順序は保証されないため sort して失敗表示を安定させる
const collectSetupNodePins = (): NodePin[] =>
  fs
    .readdirSync(workflowsDir)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort()
    .flatMap((file) => {
      const workflow = parse(fs.readFileSync(path.join(workflowsDir, file), 'utf8')) as WorkflowDocument;
      return Object.entries(workflow.jobs ?? {}).flatMap(([jobId, job]) =>
        (job.steps ?? [])
          .filter((step) => step.uses?.startsWith('actions/setup-node'))
          // String() で YAML 数値/文字列表記差異を吸収 (#2467)
          .map((step) => ({ step: `${file}#${jobId}`, version: String(step.with?.['node-version']) })),
      );
    });

describe('Node.js runtime pins', () => {
  const pins = collectSetupNodePins();

  it('pins a patched exact Node.js 22 release in every setup-node step', () => {
    expect(pins.length).toBeGreaterThan(0);
    // 違反した step だけを、ファイル・job・実際の値つきで表示する
    const stale = pins.filter((pin) => !/^22\.\d+\.\d+$/.test(pin.version) || !isAtLeast(pin.version, PATCHED_NODE_22));
    expect(stale.map(({ step, version }) => ({ step, version }))).toEqual([]);
  });

  it('uses the same Node.js release across workflows', () => {
    const byVersion: Record<string, string[]> = {};
    for (const pin of pins) (byVersion[pin.version] ??= []).push(pin.step);
    expect(byVersion).toEqual({ [pins[0].version]: pins.map((pin) => pin.step) });
  });

  it('pins a patched Node.js 24 release for Cloudflare Workers Builds', () => {
    // Workers Builds reads smkc-score-app/.node-version; without it the build image
    // default (24.18.0) predates the security release.
    const version = fs.readFileSync(nodeVersionFile, 'utf8').trim();
    expect({ version, major24: /^24\.\d+\.\d+$/.test(version), patched: isAtLeast(version, PATCHED_NODE_24) }).toEqual({
      version,
      major24: true,
      patched: true,
    });
  });
});
