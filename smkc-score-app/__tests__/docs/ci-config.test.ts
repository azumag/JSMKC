import fs from 'fs';
import path from 'path';

describe('CI workflow configuration', () => {
  const ciPath = path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'ci.yml');
  let ci: string;

  beforeAll(() => {
    ci = fs.readFileSync(ciPath, 'utf8');
  });

  // TC-2460: CI には npm audit --audit-level=high ステップが必要
  // high/critical 脆弱性を自動検出するため、smkc-score-app/ のワーキングディレクトリ内で実行する
  // --audit-level=high を選択した理由: moderate/low は devDependency の transitive 問題が多く
  // 自動修正には breaking change が必要なため、high 以上のみをブロッキング対象とする
  it('has npm audit step with --audit-level=high (TC-2460)', () => {
    expect(ci).toContain('npm audit --audit-level=high');
  });

  it('runs npm audit inside the smkc-score-app working-directory job', () => {
    // defaults.run.working-directory で全ステップが smkc-score-app/ 配下で実行される
    // これにより package-lock.json が正しく参照され ENOLOCK エラーを防ぐ
    expect(ci).toContain('working-directory: smkc-score-app');
    expect(ci).toContain('npm audit --audit-level=high');
  });

  it('runs unit tests after the audit step', () => {
    // テキスト位置でステップ順序を検証 (ci.yml はシングル steps リストのため有効)
    const auditIdx = ci.indexOf('npm audit --audit-level=high');
    const testIdx = ci.indexOf('npm test');
    expect(testIdx).toBeGreaterThan(auditIdx);
  });
});
