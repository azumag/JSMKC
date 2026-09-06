# Security audit policy

JSMKC の CI は、`smkc-score-app/` を作業ディレクトリとして `node scripts/security-audit.js` を実行し、npm dependency audit の high / critical finding を blocking として扱う。

## Fail-closed の原則

`scripts/security-audit.js` は `npm audit --json` を読み取り、high / critical finding が無い場合だけ通常成功する。期限付きの既知例外を helper 内に持つ場合も、例外条件は依存バージョン・lockfile 上の属性・dev-only 条件・package source / integrity・advisory ID と canonical URL・affected range・severity・direct advisory の package metadata・dependency graph まで狭く固定する。

`npm audit` プロセス自体も監査対象の一部として扱う。終了コード `0`（finding なし）または `1`（finding あり）の場合だけ JSON を監査結果として解釈し、起動失敗・signal 終了・`0` / `1` 以外の終了コードは、JSON が出力されていても operational failure として fail-closed にする。

direct advisory の package metadata では、`npm audit` が返す `name` / `dependency` / `severity` が許可対象パッケージと一致することも要求する。同じ advisory URL と affected range が残っていても、対象パッケージ名や dependency の帰属、advisory 自体の severity metadata が変わった場合は既知例外として扱わない。

lockfile では、許可対象パッケージの version や dev-only 属性だけでなく、`resolved` が canonical npm registry tarball を指し、`integrity` が現在の既知 artifact と一致することも要求する。同じ version 文字列でも別 registry・fork・差し替え tarball に変化した場合は例外を適用しない。

また、一時例外が成立する利用文脈も lockfile 上で固定する。root の Prisma devDependency 宣言だけでなく、実際にインストールされた Prisma とその設定パッケージの version・`resolved`・`integrity`・`devOptional` 属性、およびそこから許可対象の推移的依存へ至る dependency edge を現在確認済みの組み合わせに一致させる。manifest の許容範囲内で Prisma が更新された場合や、同じ version 名でも Prisma 側 artifact の供給元または内容が変化した場合は、実装や設定読み込み経路が変化していないかを再評価するまで既知例外を自動継続しない。

`metadata` が存在する場合は npm audit report の metadata container 自体が non-array object であることを要求する。`null`、array、string、number などへ変化した場合は、`metadata.vulnerabilities` を読めないまま「summary なし」とみなさず schema drift として fail-closed にする。`metadata.vulnerabilities` 自体は引き続き optional とし、metadata object 内の他の npm 既知フィールドを固定しすぎない。

`npm audit` の JSON に `metadata.vulnerabilities` が存在する場合は、summary が示す info / low / moderate / high / critical の各 severity 件数と `vulnerabilities` graph の実データが一致することを要求する。`total` が存在する場合は graph の entry 総数とも一致させる。また、summary の key はこれら5 severity と optional `total` だけを許可し、未知の summary key が現れた場合は npm audit schema drift として fail-closed にする。blocking severity だけが一致していても、non-blocking severity・total・summary schema が矛盾する audit 出力は有効な監査結果として扱わない。

`vulnerabilities` graph 自体も npm audit report の信頼境界として検証する。top-level は package 名をキーにした object map であり、各 entry は object かつ既知の npm severity（info / low / moderate / high / critical）を持つことを要求する。array・null・未知 severity など schema drift を示す形は「finding なし」と解釈せず、`invalid-audit-report` として fail-closed にする。さらに、各 entry の `isDirect` が存在する場合は boolean、`range` が存在する場合は string であることを要求する。`via` が存在する場合は dependency name の string または direct advisory object だけからなる array とし、direct advisory object には non-empty string の `name` / `dependency` / `range` / `url` と既知の `severity` を要求する。`effects` / `nodes` が存在する場合は string array であることを要求する。これらの graph field や advisory metadata が想定外型になった場合も schema drift として拒否する。

各 vulnerability entry に `name` が含まれる場合は、その値が top-level map の package key と一致することも要求する。key と entry 自身が異なる package identity を主張する audit 出力は、severity が non-blocking でも schema/identity drift として fail-closed にする。

dependency graph の固定は、許可チェーンに含まれるパッケージ名だけではなく、`npm audit` が返す `via` / `effects` の接続関係まで対象とする。さらに一時例外を適用する blocking chain では、各 entry の `name` / `isDirect` / `range` / `nodes` も現在確認済みの値へ固定し、脆弱な package が別の install path に現れる、direct/transitive の帰属が変わる、affected range が変化するといった利用文脈の drift を再評価なしに許可しない。既知パッケージ間で依存エッジが付け替わる、許可ルートから新しい枝が増える、direct advisory entry の構造が増減する、といった変化も既知例外としては扱わない。

次のいずれかが起きた場合は、既知例外に似ていても CI を失敗させる。

- 新しい high / critical advisory が現れる
- 許可対象の advisory ID / canonical URL / affected range、severity、direct advisory の package metadata、依存バージョン、dependency graph、または許可チェーンの `name` / `isDirect` / `range` / `nodes` が変化する
- 許可対象パッケージまたは許可対象の利用文脈を構成する Prisma chain の `resolved` source / `integrity` が現在の既知 npm artifact から変化する
- `metadata` が存在するのに non-array object ではない、`metadata.vulnerabilities` の summary 件数と vulnerability graph の severity 件数が矛盾する、`total` と graph entry 総数が一致しない、または未知の summary key が現れる
- `vulnerabilities` が object map でない、entry が object でない、未知の severity が現れる、entry の `name` が top-level package key と矛盾する、`isDirect` / `range` の型が既知 schema と異なる、direct advisory object の `name` / `dependency` / `severity` / `range` / `url` metadata が欠落・型変化する、または `via` / `effects` / `nodes` の container・member 型が既知 schema と異なるなど audit report schema / package identity が変化する
- 許可対象を成立させている root の devDependency 宣言や production/dev-only 境界など、manifest / lockfile の前提が変化する。特にインストール済み Prisma chain の version・dev-only 属性、または lockfile 上の依存エッジの変化は再評価を要求する
- `npm audit` が起動失敗・signal 終了・`0` / `1` 以外の終了コードになる、または JSON を取得・解析できない

個別の一時例外の内容や解消状況は helper と追跡 issue に集約し、この文書では CI が維持すべき振る舞いだけを定義する。

## CI の実行順

通常の lint / formatting / unit test を先に実行し、その後に security audit を実行する。既知の audit finding が存在する期間でも、機能回帰テストの結果を audit より先に観測できるようにするためである。ただし security audit 自体は blocking のままとし、予期しない high / critical finding を許容しない。

## TC-2460 の安定契約

`E2E_TEST_CASES.md` の TC-2460 は、特定の `npm audit` コマンド文字列ではなく、「CI が `node scripts/security-audit.js` を入口として high / critical finding を blocking に扱う」という振る舞いを記述する。drift guard も同じ安定契約を検証し、一時例外の advisory ID や依存バージョンなどの可変な詳細は helper と #3114 に寄せる。

## 回帰テスト

- `smkc-score-app/__tests__/docs/ci-config.test.ts`: CI が `npm test -- --ci --forceExit` を security audit より前に実行し、`node scripts/security-audit.js` を呼ぶことを静的に検証する。
- `smkc-score-app/__tests__/scripts/security-audit.test.ts`: fail-closed helper の許可条件と、advisory の canonical URL・affected range・severity・direct advisory の `name` / `dependency` / `severity` metadata・`via` / `effects` topology、許可チェーンの `name` / `isDirect` / `range` / `nodes`、blocking audit summary severity 件数、root devDependency 宣言、インストール済み Prisma chain の version / `resolved` / `integrity` / dev-only 属性 / lockfile 依存エッジ、許可対象 artifact の `resolved` / `integrity` を含む前提が変化した場合の blocking 動作を検証する。
- `smkc-score-app/__tests__/scripts/security-audit-summary.test.ts`: `metadata.vulnerabilities` の全 severity 件数と optional `total` が vulnerability graph と一致し、summary key が既知 severity と `total` に限定されることを検証し、non-blocking severity の件数差・total 差・未知 key を fail-closed にする契約を固定する。
- `smkc-score-app/__tests__/scripts/security-audit-report-shape.test.ts`: optional `metadata` container が non-array object であること、`vulnerabilities` object map、各 entry の severity schema、entry の `name` と top-level package key の identity consistency、optional `isDirect` / `range` の型、direct advisory object の `name` / `dependency` / `severity` / `range` / `url` metadata、および `via` / `effects` / `nodes` の container・member 型を検証し、metadata container drift・array・非 object entry・未知 severity・矛盾した package identity・graph/advisory field の型 drift を fail-closed にする契約を固定する。
- `smkc-score-app/__tests__/scripts/security-audit-exit-status.test.ts`: `npm audit` の終了コード `0` / `1` だけを監査結果として許容し、それ以外の process status を fail-closed にする契約を検証する。
- `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`: E2E 台帳の TC-2460 が上記の安定契約と同期していることを検証する。

関連: #3114, #3118
