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
        `ci.yml の jobs['lint-and-test'].steps が見つかりません。YAML 構造が変更された可能性があります。`
      );
    }
    lintAndTestJob = workflow.jobs['lint-and-test'];
  });

  // TC-2460: CI には npm audit --audit-level=high ステップが必要
  // high/critical 脆弱性を自動検出するため、smkc-score-app/ のワーキングディレクトリ内で実行する
  // --audit-level=high を選択した理由: moderate/low は devDependency の transitive 問題が多く
  // 自動修正には breaking change が必要なため、high 以上のみをブロッキング対象とする
  it('has npm audit step with --audit-level=high in lint-and-test job (TC-2460)', () => {
    const auditStep = lintAndTestJob.steps.find((s) =>
      s.run?.includes('npm audit --audit-level=high')
    );
    expect(auditStep).toBeDefined();
  });

  it('runs npm audit inside the smkc-score-app working-directory job', () => {
    // defaults.run.working-directory で全ステップが smkc-score-app/ 配下で実行される
    // これにより package-lock.json が正しく参照され ENOLOCK エラーを防ぐ
    const workingDir = lintAndTestJob.defaults?.run?.['working-directory'];
    expect(workingDir).toBe('smkc-score-app');
  });

  it('runs unit tests after the audit step in the same job steps array', () => {
    // YAML 構造として steps 配列を検証することで、パターンの複数出現や
    // 異なる job への誤参照を防ぐ (indexOf による文字列比較は使用しない)
    const steps = lintAndTestJob.steps;

    // 各ステップが steps 配列に 1 件だけ存在することを filter で確認してから
    // indexOf でインデックスを取得する (#2465: findIndex の二重走査を解消)
    const auditSteps = steps.filter((s) => s.run?.includes('npm audit --audit-level=high'));
    // \bnpm test\b の語境界で絞り込み、npm run test:coverage 等の部分一致を排除する
    const testSteps = steps.filter((s) => s.run?.match(/\bnpm test\b/));

    expect(auditSteps).toHaveLength(1);
    expect(testSteps).toHaveLength(1);

    // filter 結果から steps.indexOf で参照比較によりインデックスを得る
    // (同じ predicate で findIndex を再実行する二重走査を回避)
    const auditIdx = steps.indexOf(auditSteps[0]);
    const testIdx = steps.indexOf(testSteps[0]);
    expect(testIdx).toBeGreaterThan(auditIdx);
  });

  it('runs lint before the security audit step', () => {
    // Lint → Security audit → Unit tests の順序を保証する。
    // lint エラーが早期に検出されるよう audit より前に配置する必要がある。
    const steps = lintAndTestJob.steps;
    const lintSteps = steps.filter((s) => s.run?.match(/\bnpm run lint\b/));
    const auditSteps = steps.filter((s) => s.run?.includes('npm audit --audit-level=high'));

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
    const setupNodeStep = lintAndTestJob.steps.find((s) =>
      s.uses?.startsWith('actions/setup-node')
    );
    expect(setupNodeStep).toBeDefined();
    expect(setupNodeStep?.with?.['node-version']).toBe('22');
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
