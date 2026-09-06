# Security audit policy

JSMKC の CI は、`smkc-score-app/` を作業ディレクトリとして `node scripts/security-audit-lockfile.js` で lockfile schema を事前検証した後、`node scripts/security-audit.js` を実行し、npm dependency audit の high / critical finding を blocking として扱う。

## Fail-closed の原則

`scripts/security-audit.js` は `npm audit --json` を読み取り、high / critical finding が無い場合だけ通常成功する。期限付きの既知例外を helper 内に持つ場合も、例外条件は依存バージョン・lockfile 上の属性・dev-only 条件・package source / integrity・advisory ID と canonical URL・affected range・severity・direct advisory の package metadata・dependency graph・remediation availability まで狭く固定する。

現在の #3114 一時例外には **2026-10-06T00:00:00.000Z** の再レビュー期限を設定する。期限に達した時点で advisory・依存グラフ・artifact・remediation metadata が完全一致したままでも CI は fail-closed にし、upstream の修正状況と `npm audit` の最新結果を人手で再確認するまで例外を自動延長しない。期限文字列の解析結果が `NaN` / 非有限値になる場合も「期限なし」と解釈せず fail-closed にする。継続が必要な場合は #3114 に再評価根拠を記録したうえで期限を明示的に更新し、解消済みなら例外自体を削除する。

`npm audit` プロセス自体も監査対象の一部として扱う。終了コード `0`（finding なし）または `1`（finding あり）の場合だけ JSON を監査結果として解釈し、起動失敗・signal 終了・`0` / `1` 以外の終了コードは、JSON が出力されていても operational failure として fail-closed にする。

`npm audit --json` の top-level に `error` field が存在する場合は、その値が `null` / `false` / 空文字など truthy でなくても成功レポートとして扱わない。npm が error envelope を返したという schema signal 自体を operational failure とみなし、`invalid-audit-report` として fail-closed にする。

CI entrypoint では `auditReportVersion` を必須とし、現在検証済みの npm audit report schema version `2` と完全一致することを要求する。field が欠落している場合や、明示された report version が `1` / `3` / string / `null` などへ変化した場合は、同じ JSON 形状でも意味論を確認できないため fail-closed にする。内部の `evaluateAuditReport` は既存 synthetic fixture の互換性のため version field 省略入力を引き続き扱えるが、実際の `npm audit --json` 出力を処理する `main()` はその互換経路を通さず schema version を必須検証する。

成功時の `npm audit --json` top-level field も現在確認済みの `auditReportVersion` / `vulnerabilities` / `metadata` のみに固定する。未知の top-level field が追加された場合は、report version が `2` のままでも新しい意味論や envelope が導入された可能性があるため、既知例外を評価せず `invalid-audit-report` として fail-closed にする。内部 synthetic fixture はこの3 fieldの部分集合を引き続き利用できる。

direct advisory の package metadata では、`npm audit` が返す `name` / `dependency` / `title` / `severity` が許可対象 advisory と一致することも要求する。さらに advisory の `source` ID、CWE 分類、CVSS score / vector を現在確認済みの risk metadata に固定し、これらが変化した場合は advisory の評価が更新された可能性があるため既知例外を自動継続しない。同じ advisory URL と affected range が残っていても、対象パッケージ名や dependency の帰属、title、severity、risk metadata が変わった場合は再評価を要求する。

lockfile では、許可対象パッケージの version や dev-only 属性だけでなく、`resolved` が canonical npm registry tarball を指し、`integrity` が現在の既知 artifact と一致することも要求する。同じ version 文字列でも別 registry・fork・差し替え tarball に変化した場合は例外を適用しない。

また、一時例外が成立する利用文脈は manifest と lockfile の両方で固定する。helper は実際の `package.json` を独立に読み、Prisma が現在確認済みの devDependency range で宣言され、production dependency には存在しないことを要求する。`dependencies` / `devDependencies` は、存在する場合に npm manifest / lockfile の dependency map として non-array object であることも検証し、array・scalar などの container drift を「Prisma が存在しない」と解釈して例外を継続しない。そのうえで `package-lock.json` root snapshot の Prisma devDependency 宣言も同じ条件へ固定し、実際にインストールされた Prisma とその設定パッケージの version・`resolved`・`integrity`・`devOptional` 属性、およびそこから許可対象の推移的依存へ至る dependency edge を現在確認済みの組み合わせに一致させる。`package.json` だけが編集され lockfile snapshot が古いまま残る場合や、manifest の許容範囲内で Prisma が更新された場合、同じ version 名でも Prisma 側 artifact の供給元または内容が変化した場合は、実装や設定読み込み経路が変化していないかを再評価するまで既知例外を自動継続しない。

この例外判定は npm package-lock v3 の `packages` map とその属性意味論に依存するため、CI は audit helper の前に `scripts/security-audit-lockfile.js` を実行する。`package-lock.json` の top-level が object であり、`lockfileVersion` が現在の `3`、`packages` が non-array object、かつ `packages[""]` の root package snapshot が non-array object である場合だけ監査へ進む。lockfile schema が更新・欠落・破損した場合は、同じフィールド名が残っていても意味論が変化している可能性があるため、例外を再評価するまで fail-closed にする。

`metadata` が存在する場合は npm audit report の metadata container 自体が non-array object であることを要求し、現在確認済みの `vulnerabilities` / `dependencies` 以外の未知の metadata field を許可しない。`null`、array、string、number などへ変化した場合や未知 field が追加された場合は、既知の summary を読める形が残っていても schema drift として fail-closed にする。内部の `evaluateAuditReport` は既存 synthetic fixture の互換性のため summary 省略入力を引き続き扱えるが、実際の `npm audit --json` 出力を処理する CI entrypoint では `metadata.vulnerabilities` を必須とし、info / low / moderate / high / critical の5 severity key と `total` がすべて存在する現在確認済みの summary shape を要求する。

`metadata.dependencies` も npm audit v2 の report contract として検証する。存在する場合は non-array object で、現在確認済みの prod / dev / optional / peer / peerOptional / total 以外の key を許可せず、含まれる count はすべて0以上の integer であることを要求する。実 CI entrypoint では6 keyすべてを必須にするため、dependency summary の欠落・型変更・未知 key 追加を、脆弱性 graph が同じでも再評価なしには受理しない。さらに `total` は同じ監査対象の `package-lock.json` に記録された root (`packages[""]`) 以外の package entry 数と一致することを要求し、audit JSON と lockfile の対象集合が食い違う場合は fail-closed にする。これらの category count は npm の分類上相互排他的とは限らないため、prod / dev / optional / peer / peerOptional の単純合計と `total` の一致までは要求しない。

`npm audit` の JSON に `metadata.vulnerabilities` が存在する場合は、summary が示す info / low / moderate / high / critical の各 severity 件数と `vulnerabilities` graph の実データが一致することを要求する。内部 evaluator では `total` が存在する場合に graph の entry 総数とも一致させ、summary の key はこれら5 severity と optional `total` だけを許可する。実 CI entrypoint では前段で5 severity key と `total` の存在自体も必須にするため、現在の npm audit v2 summary が一部 field を落とす schema drift も再評価なしには受理しない。blocking severity だけが一致していても、non-blocking severity・total・summary schema が矛盾する audit 出力は有効な監査結果として扱わない。

`vulnerabilities` graph 自体も npm audit report の信頼境界として検証する。top-level は package 名をキーにした object map であり、各 entry は object かつ既知の npm severity（info / low / moderate / high / critical）を持ち、現在確認済みの `name` / `severity` / `isDirect` / `via` / `effects` / `range` / `nodes` / `fixAvailable` 以外の top-level field を含まないことを要求する。array・null・未知 severity・未知 field など schema drift を示す形は「finding なし」と解釈せず、`invalid-audit-report` として fail-closed にする。さらに、各 entry の `isDirect` が存在する場合は boolean、`range` が存在する場合は string であることを要求する。`via` が存在する場合は dependency name の string または direct advisory object だけからなる array とし、direct advisory object には non-empty string の `name` / `dependency` / `range` / `url` と既知の `severity` を要求する。optional な `source` は正の integer、`title` は non-empty string、`cwe` は non-empty string array、`cvss` は `score`（0〜10 の有限値）と `vectorString`（null または non-empty string）だけを持つ object として検証する。さらに direct advisory object 自体にも現在認識している field 以外の未知 field を許可しない。`effects` / `nodes` が存在する場合は string array であることを要求する。これらの graph field や advisory metadata が想定外型になった場合も schema drift として拒否する。

各 vulnerability entry の optional `fixAvailable` も監査結果の意味論として検証する。boolean または `name` / `version` の non-empty string と boolean `isSemVerMajor` の3 fieldだけを持つ object を受理し、未知 field・その他の型・欠落 metadata は schema drift として `invalid-audit-report` にする。一時例外の blocking chain ではさらに厳しく、現在 `npm audit --json` が3 entryすべてで返している semver-major remediation target の package identity / version と完全一致する `fixAvailable` object を必須とする。`fixAvailable` が省略される、`false` / `true` に変わる、`isSemVerMajor: false` になる、または target が変化した場合は、npm の remediation 判定や schema が変化した可能性があるため既知例外を停止し、人手で再評価する。つまり通常の `npm audit fix` で適用可能な非破壊 remediation が利用可能になった場合だけでなく、現在観測している remediation metadata 自体が消失・変化した場合にも、脆弱性を放置したまま allowlist を自動継続しない。

各 vulnerability entry に `name` が含まれる場合は、その値が top-level map の package key と一致することも要求する。key と entry 自身が異なる package identity を主張する audit 出力は、severity が non-blocking でも schema/identity drift として fail-closed にする。

dependency graph の固定は、許可チェーンに含まれるパッケージ名だけではなく、`npm audit` が返す `via` / `effects` の接続関係まで対象とする。さらに一時例外を適用する blocking chain では、各 entry の `name` / `isDirect` / `range` / `nodes` も現在確認済みの値へ固定し、脆弱な package が別の install path に現れる、direct/transitive の帰属が変わる、affected range が変化するといった利用文脈の drift を再評価なしに許可しない。既知パッケージ間で依存エッジが付け替わる、許可ルートから新しい枝が増える、direct advisory entry の構造が増減する、といった変化も既知例外としては扱わない。

次のいずれかが起きた場合は、既知例外に似ていても CI を失敗させる。

- #3114 一時例外の再レビュー期限 `2026-10-06T00:00:00.000Z` に到達する、または期限文字列を有限な時刻へ解析できない
- 新しい high / critical advisory が現れる
- 許可対象の advisory ID / canonical URL / affected range、severity、direct advisory の package metadata、`title` / `source` / CWE / CVSS risk metadata、依存バージョン、dependency graph、または許可チェーンの `name` / `isDirect` / `range` / `nodes` が変化する
- 許可対象 blocking chain のいずれかで `fixAvailable` が欠落・boolean 化する、non-breaking remediation が現れる、semver-major remediation の target identity / version が現在確認済みの値から変化する、または `fixAvailable` metadata に未知 field・型・必須 field の drift が現れる
- 許可対象パッケージまたは許可対象の利用文脈を構成する Prisma chain の `resolved` source / `integrity` が現在の既知 npm artifact から変化する
- `package-lock.json` が v3 object schema でなくなる、`lockfileVersion` が `3` 以外になる、`packages` map が欠落・非 object / array になる、または `packages[""]` の root package snapshot が欠落・非 object / array になる
- `npm audit --json` の top-level に `error` field が現れる（値の truthiness は問わない）
- `auditReportVersion` が欠落する、または現在検証済みの `2` と一致しない、もしくは成功レポートの top-level に `auditReportVersion` / `vulnerabilities` / `metadata` 以外の未知 field が現れる
- `metadata` が存在するのに non-array object ではない、CI entrypoint で `metadata.vulnerabilities` 自体または info / low / moderate / high / critical / `total` の必須 key が欠落する、summary 件数と vulnerability graph の severity 件数が矛盾する、vulnerability `total` と graph entry 総数が一致しない、dependency `total` と `package-lock.json` の installed package entry 数が一致しない、または未知の summary key が現れる
- `vulnerabilities` が object map でない、entry が object でない、未知の severity または top-level field が現れる、entry の `name` が top-level package key と矛盾する、`isDirect` / `range` の型が既知 schema と異なる、direct advisory object の `name` / `dependency` / `severity` / `range` / `url` metadata が欠落・型変化する、optional `source` / `title` / `cwe` / `cvss` の型・field set が既知 schema と異なる、direct advisory object に未知 field が現れる、または `via` / `effects` / `nodes` の container・member 型が既知 schema と異なるなど audit report schema / package identity が変化する
- 許可対象を成立させている実 `package.json` と `package-lock.json` root snapshot の devDependency 宣言や production/dev-only 境界など、manifest / lockfile の前提が変化する。`dependencies` / `devDependencies` が object map 以外へ drift した場合も含め、特に両者の Prisma 宣言が一致しない、インストール済み Prisma chain の version・dev-only 属性、または lockfile 上の依存エッジが変化した場合は再評価を要求する
- `npm audit` が起動失敗・signal 終了・`0` / `1` 以外の終了コードになる、または JSON を取得・解析できない

個別の一時例外の内容や解消状況は helper と追跡 issue に集約し、この文書では CI が維持すべき振る舞いだけを定義する。

## CI の実行順

通常の lint / formatting / unit test を先に実行し、その後に lockfile schema preflight と security audit を実行する。既知の audit finding が存在する期間でも、機能回帰テストの結果を audit より先に観測できるようにするためである。ただし lockfile preflight と security audit 自体は blocking のままとし、schema drift や予期しない high / critical finding を許容しない。

## TC-2460 の安定契約

`E2E_TEST_CASES.md` の TC-2460 は、特定の `npm audit` コマンド文字列ではなく、「CI が `node scripts/security-audit.js` を入口として high / critical finding を blocking に扱う」という振る舞いを記述する。drift guard も同じ安定契約を検証し、一時例外の advisory ID や依存バージョンなどの可変な詳細は helper と #3114 に寄せる。lockfile schema preflight はこの入口を安全に実行するための追加 precondition とし、TC-2460 の high / critical blocking 契約自体は変更しない。

## 回帰テスト

- `smkc-score-app/__tests__/docs/ci-config.test.ts`: CI が `npm test -- --ci --forceExit` を security audit より前に実行し、`node scripts/security-audit.js` を呼ぶことを静的に検証する。
- `smkc-score-app/__tests__/scripts/security-audit-lockfile.test.ts`: 実リポジトリの package-lock が v3 object schema と object 型の root package snapshot を満たすこと、schema version・top-level / `packages` container・root snapshot の drift を拒否すること、CI が schema preflight を audit helper より先に実行することを検証する。
- `smkc-score-app/__tests__/scripts/security-audit.test.ts`: fail-closed helper の許可条件と、advisory の canonical URL・affected range・severity・direct advisory の `name` / `dependency` / `title` / `severity` / `source` / CWE / CVSS metadata・`via` / `effects` topology、許可チェーンの `name` / `isDirect` / `range` / `nodes`、blocking audit summary severity 件数、実 `package.json` と `package-lock.json` root snapshot の devDependency / production 境界、インストール済み Prisma chain の version / `resolved` / `integrity` / dev-only 属性 / lockfile 依存エッジ、許可対象 artifact の `resolved` / `integrity` を含む前提が変化した場合の blocking 動作を検証する。
- `smkc-score-app/__tests__/scripts/security-audit-fix-availability.test.ts`: optional `fixAvailable` の schema と既知 field set を検証し、現在確認済みの semver-major remediation または remediation なしでは一時例外を維持する一方、non-breaking remediation、major remediation target の identity / version drift、未知 field が現れた場合は fail-closed にする契約を固定する。
- `smkc-score-app/__tests__/scripts/security-audit-summary.test.ts`: `metadata.vulnerabilities` の全 severity 件数と optional `total` が vulnerability graph と一致し、summary key が既知 severity と `total` に限定されることを検証し、non-blocking severity の件数差・total 差・未知 key を fail-closed にする契約を固定する。
- `smkc-score-app/__tests__/scripts/security-audit-report-shape.test.ts`: CI entrypoint が `auditReportVersion: 2` と完全な `metadata.vulnerabilities` summary（5 severity key + `total`）および完全な `metadata.dependencies` summary を必須とし、dependency `total` が `package-lock.json` の root 以外の package entry 数と一致すること、成功レポートの top-level field を `auditReportVersion` / `vulnerabilities` / `metadata` に限定すること、内部 evaluator では synthetic fixture 互換の省略入力を維持すること、optional `metadata` container が non-array object であること、`vulnerabilities` object map、各 entry の severity schema と既知 top-level field set、entry の `name` と top-level package key の identity consistency、optional `isDirect` / `range` の型、direct advisory object の `name` / `dependency` / `severity` / `range` / `url` metadataと optional `source` / `title` / `cwe` / `cvss` risk metadata、未知 field の拒否、および `via` / `effects` / `nodes` の container・member 型を検証し、report version / top-level / summary shape drift・metadata container drift・audit JSON と lockfile の対象集合不一致・array・非 object entry・未知 severity・矛盾した package identity・graph/advisory field の型 drift を fail-closed にする契約を固定する。
- `smkc-score-app/__tests__/scripts/security-audit-error-report.test.ts`: top-level `error` field が存在する audit JSON を値の truthiness に関係なく `invalid-audit-report` として拒否する契約を固定する。
- `smkc-score-app/__tests__/scripts/security-audit-expiry.test.ts`: #3114 一時例外の再レビュー期限について、期限直前は有効、期限到達時・期限経過後・不正な時刻値では fail-closed になる契約を固定する。
- `smkc-score-app/__tests__/scripts/security-audit-exit-status.test.ts`: `npm audit` の終了コード `0` / `1` だけを監査結果として許容し、それ以外の process status を fail-closed にする契約を検証する。
- `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`: E2E 台帳の TC-2460 が上記の安定契約と同期していることを検証する。

関連: #3114, #3118
