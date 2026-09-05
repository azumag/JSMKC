import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

// ci.yml を YAML 構造として検証するために必要な最小限の型定義
// (YAML パース結果は unknown なので as でキャストする前に実行時ガードを挟む)
interface CiStep {
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}

interface CiJob {
  defaults?: { run?: { 'working-directory'?: string } };
  steps: CiStep[];
}

interface CiWorkflow {
  jobs: Record<string, CiJob>;
}

describe('CI workflow configuration', () => {
  const ciPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'ci.yml');
  // YAML パース結果を格納。beforeAll で設定される。
  let lintAndTestJob: CiJob;

  beforeAll(() => {
    const raw = fs.readFileSync(ciPath, 'utf8');
    const workflow = parse(raw) as CiWorkflow;
    // jobs キーが存在しない (不正な YAML、コンフリクトマーカー混入等) 場合に
    // 各 it ブロックで TypeError が出るより明確なエラーにするための実行時ガード。
    // steps が undefined/空の場合も同様に早期エラーとする (#2464)
    if (!workflow?.jobs?.['lint-and-test']?.steps?.length) {
      throw new Error(
        `ci.yml の jobs['lint-and-test'].steps が見つかりません。YAML 構造が変更された可能性があります。`,
      );
    }
    lintAndTestJob = workflow.jobs['lint-and-test'];
  });

  // TC-2460: CI には high/critical を blocking にする dependency audit が必要。
  // #3114 の既知 Prisma transitive advisory だけは scripts/security-audit.js が
  // fail-closed 条件付きで扱い、それ以外の high/critical は引き続き失敗させる。
  it('has the fail-closed security audit helper in lint-and-test job (TC-2460)', () => {
    const auditStep = lintAndTestJob.steps.find((s) =>
      s.run?.includes('node scripts/security-audit.js'),
    );
    expect(auditStep).toBeDefined();
  });

  it('runs the security audit inside the smkc-score-app working-directory job', () => {
    // defaults.run.working-directory で全ステップが smkc-score-app/ 配下で実行される。
    // helper が package-lock.json を直接検証するため、この working-directory は必須。
    const workingDir = lintAndTestJob.defaults?.run?.['working-directory'];
    expect(workingDir).toBe('smkc-score-app');
  });

  it('runs unit tests before the blocking audit step in the same job steps array', () => {
    // Security audit は blocking のまま維持しつつ、既存 advisory がある場合でも
    // PR の機能テスト結果を失わないよう Unit tests を先に実行する。
    const steps = lintAndTestJob.steps;

    const auditSteps = steps.filter((s) => s.run?.includes('node scripts/security-audit.js'));
    // \bnpm test\b の語境界で絞り込み、npm run test:coverage 等の部分一致を排除する
    const testSteps = steps.filter((s) => s.run?.match(/\bnpm test\b/));

    expect(auditSteps).toHaveLength(1);
    expect(testSteps).toHaveLength(1);

    const auditIdx = steps.indexOf(auditSteps[0]);
    const testIdx = steps.indexOf(testSteps[0]);
    expect(auditIdx).toBeGreaterThan(testIdx);
  });

  it('runs lint before the security audit step', () => {
    // Lint → Unit tests → Security audit の順序を保証する。
    // lint エラーは早期検出しつつ、audit 前に機能テスト結果を残す。
    const steps = lintAndTestJob.steps;
    const lintSteps = steps.filter((s) => s.run?.match(/\bnpm run lint\b/));
    const auditSteps = steps.filter((s) => s.run?.includes('node scripts/security-audit.js'));

    expect(lintSteps).toHaveLength(1);
    expect(auditSteps).toHaveLength(1);

    const lintIdx = steps.indexOf(lintSteps[0]);
    const auditIdx = steps.indexOf(auditSteps[0]);
    expect(lintIdx).toBeGreaterThanOrEqual(0);
    expect(auditIdx).toBeGreaterThan(lintIdx);
  });

  it('uses Node.js 22 in setup-node step', () => {
    // Node.js バージョンのドリフトを検出する。
    // package.json engines や Cloudflare Workers ランタイムとの互換性を維持するため
    // バージョンを 22 に固定している。
    const setupNodeStep = lintAndTestJob.steps.find((s) => s.uses?.startsWith('actions/setup-node'));
    expect(setupNodeStep).toBeDefined();
    // String() で YAML 数値/文字列表記差異を吸収 (#2467)
    expect(String(setupNodeStep?.with?.['node-version'])).toBe('22');
  });

  it('passes --ci and --forceExit flags to npm test', () => {
    // --ci: テスト失敗時に即座に終了し、スナップショットを自動更新しない
    // --forceExit: 非同期タスクが残留しても CI がハングしないようにする
    const testStep = lintAndTestJob.steps.find((s) => s.run?.match(/\bnpm test\b/));
    expect(testStep?.run).toMatch(/--ci\b/);
    expect(testStep?.run).toMatch(/--forceExit\b/);
  });

  it('sets SKIP_OPENNEXT_CLOUDFLARE_DEV env var in npm test step', () => {
    // opennextjs-cloudflare の開発サーバー起動をスキップして
    // CI でのテスト実行時間を削減するための環境変数
    const testStep = lintAndTestJob.steps.find((s) => s.run?.match(/\bnpm test\b/));
    expect(testStep?.env?.['SKIP_OPENNEXT_CLOUDFLARE_DEV']).toBe('1');
  });
});
