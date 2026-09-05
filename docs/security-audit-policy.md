# Security audit policy

JSMKC の CI は、`smkc-score-app/` を作業ディレクトリとして `node scripts/security-audit.js` を実行し、npm dependency audit の high / critical finding を blocking として扱う。

## Fail-closed の原則

`scripts/security-audit.js` は `npm audit --json` を読み取り、high / critical finding が無い場合だけ通常成功する。期限付きの既知例外を helper 内に持つ場合も、例外条件は依存バージョン・lockfile 上の属性・dev-only 条件・advisory ID と canonical URL・affected range・severity・direct advisory の package metadata・dependency graph まで狭く固定する。

direct advisory の package metadata では、`npm audit` が返す `name` / `dependency` / `severity` が許可対象パッケージと一致することも要求する。同じ advisory URL と affected range が残っていても、対象パッケージ名や dependency の帰属、advisory 自体の severity metadata が変わった場合は既知例外として扱わない。

`npm audit` の JSON に `metadata.vulnerabilities` が存在する場合は、summary が示す high / critical severity の件数と `vulnerabilities` graph の実データが一致することも要求する。summary と graph が矛盾する audit 出力は、既知例外に似た graph が残っていても有効な監査結果として扱わない。

dependency graph の固定は、許可チェーンに含まれるパッケージ名だけではなく、`npm audit` が返す `via` / `effects` の接続関係まで対象とする。既知パッケージ間で依存エッジが付け替わる、許可ルートから新しい枝が増える、direct advisory entry の構造が増減する、といった変化も既知例外としては扱わない。

次のいずれかが起きた場合は、既知例外に似ていても CI を失敗させる。

- 新しい high / critical advisory が現れる
- 許可対象の advisory ID / canonical URL / affected range、severity、direct advisory の package metadata、依存バージョン、dependency graph が変化する
- `metadata.vulnerabilities` の high / critical summary 件数と vulnerability graph の severity 件数が矛盾する
- 許可対象を成立させている root の devDependency 宣言や production/dev-only 境界など、manifest / lockfile の前提が変化する
- `npm audit` の JSON を取得または解析できない

個別の一時例外の内容や解消状況は helper と追跡 issue に集約し、この文書では CI が維持すべき振る舞いだけを定義する。

## CI の実行順

通常の lint / formatting / unit test を先に実行し、その後に security audit を実行する。既知の audit finding が存在する期間でも、機能回帰テストの結果を audit より先に観測できるようにするためである。ただし security audit 自体は blocking のままとし、予期しない high / critical finding を許容しない。

## TC-2460 の安定契約

`E2E_TEST_CASES.md` の TC-2460 は、特定の `npm audit` コマンド文字列ではなく、「CI が `node scripts/security-audit.js` を入口として high / critical finding を blocking に扱う」という振る舞いを記述する。drift guard も同じ安定契約を検証し、一時例外の advisory ID や依存バージョンなどの可変な詳細は helper と #3114 に寄せる。

## 回帰テスト

- `smkc-score-app/__tests__/docs/ci-config.test.ts`: CI が `npm test -- --ci --forceExit` を security audit より前に実行し、`node scripts/security-audit.js` を呼ぶことを静的に検証する。
- `smkc-score-app/__tests__/scripts/security-audit.test.ts`: fail-closed helper の許可条件と、advisory の canonical URL・affected range・severity・direct advisory の `name` / `dependency` / `severity` metadata・`via` / `effects` topology、audit summary severity 件数、root devDependency 宣言を含む前提が変化した場合の blocking 動作を検証する。
- `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`: E2E 台帳の TC-2460 が上記の安定契約と同期していることを検証する。

関連: #3114, #3118
