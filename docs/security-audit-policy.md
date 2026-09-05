# Security audit policy

JSMKC の CI は、`smkc-score-app/` を作業ディレクトリとして `node scripts/security-audit.js` を実行し、npm dependency audit の high / critical finding を blocking として扱う。

## Fail-closed の原則

`scripts/security-audit.js` は `npm audit --json` を読み取り、high / critical finding が無い場合だけ通常成功する。期限付きの既知例外を helper 内に持つ場合も、例外条件は依存バージョン・lockfile 上の属性・dev-only 条件・advisory・severity・dependency graph まで狭く固定する。

次のいずれかが起きた場合は、既知例外に似ていても CI を失敗させる。

- 新しい high / critical advisory が現れる
- 許可対象の advisory、severity、依存バージョン、dependency graph が変化する
- 許可対象の依存が production dependency に入るなど、lockfile の前提が変化する
- `npm audit` の JSON を取得または解析できない

個別の一時例外の内容や解消状況は helper と追跡 issue に集約し、この文書では CI が維持すべき振る舞いだけを定義する。

## CI の実行順

通常の lint / formatting / unit test を先に実行し、その後に security audit を実行する。既知の audit finding が存在する期間でも、機能回帰テストの結果を audit より先に観測できるようにするためである。ただし security audit 自体は blocking のままとし、予期しない high / critical finding を許容しない。

## 回帰テスト

- `smkc-score-app/__tests__/ci-config.test.ts`: CI が `npm test -- --ci --forceExit` を security audit より前に実行し、`node scripts/security-audit.js` を呼ぶことを静的に検証する。
- `smkc-score-app/__tests__/ci-security-audit.test.ts`: fail-closed helper の許可条件と、条件が変化した場合の blocking 動作を検証する。
- `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`: E2E 台帳の security audit 記述が CI と同期していることを検証する。

関連: #3114, #3118
