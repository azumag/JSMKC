import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

// ci.yml を YAML 構造として検証するために必要な最小限の型定義
// (YAML パース結果は unknown なので as でキャストする前に実行時ガードを挟む)
interface CiStep {
  run?: string;
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
    // 各 it ブロックで TypeError が出るより明確なエラーにするための実行時ガード
    if (!workflow?.jobs?.['lint-and-test']) {
      throw new Error(
        `ci.yml の jobs['lint-and-test'] が見つかりません。ジョブ名が変更された可能性があります。`
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

    // 各ステップが steps 配列に 1 件だけ存在することを確認してから
    // インデックスを比較する (複数マッチ時の誤判定を防ぐ)
    const auditSteps = steps.filter((s) => s.run?.includes('npm audit --audit-level=high'));
    // \bnpm test\b の語境界で絞り込み、npm run test:coverage 等の部分一致を排除する
    const testSteps = steps.filter((s) => s.run?.match(/\bnpm test\b/));

    expect(auditSteps).toHaveLength(1);
    expect(testSteps).toHaveLength(1);

    const auditIdx = steps.findIndex((s) => s.run?.includes('npm audit --audit-level=high'));
    const testIdx = steps.findIndex((s) => s.run?.match(/\bnpm test\b/));
    expect(testIdx).toBeGreaterThan(auditIdx);
  });
});
