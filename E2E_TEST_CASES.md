# E2E Test Cases - JSMKC (preview.smkc.bluemoon.works)

## Project: JSMKC - Japan SMK Championship
## Target: https://preview.smkc.bluemoon.works/
## Framework: Next.js 16 (App Router) + React 19
## i18n: next-intl (en/ja)

---

## TC-001: トップページの表示と基本要素の確認
- **URL**: /
- **authRequired**: false
- **手順**:
  1. https://preview.smkc.bluemoon.works/ にアクセス
  2. ページタイトルを確認
  3. ナビゲーション要素を確認（Players, Tournaments リンク）
  4. 言語切り替えボタンの存在確認
  5. ログインリンクの存在確認
- **期待結果**: ページが正常に表示され、主要なナビゲーション要素が存在する

## TC-002: Players ページの表示
- **URL**: /players
- **authRequired**: false
- **手順**:
  1. https://preview.smkc.bluemoon.works/players にアクセス
  2. プレイヤー一覧が表示されるか確認
  3. テーブルまたはリスト形式でデータが表示されるか確認
- **期待結果**: プレイヤー一覧が正常に表示される

## TC-003: Tournaments ページの表示
- **URL**: /tournaments
- **authRequired**: false
- **手順**:
  1. https://preview.smkc.bluemoon.works/tournaments にアクセス
  2. トーナメント一覧が表示されるか確認
  3. ステータスバッジが表示されるか確認
- **期待結果**: トーナメント一覧が正常に表示される

## TC-004: トーナメント詳細ページ（TA モード）
- **URL**: /tournaments/[id]/ta
- **authRequired**: false
- **手順**:
  1. トーナメント一覧からトーナメントをクリック
  2. TA (Time Attack) ページにリダイレクトされることを確認
  3. モードタブ（TA, BM, MR, GP）が表示されるか確認
  4. スタンディング・マッチ情報が表示されるか確認
- **期待結果**: トーナメント詳細が正常に表示され、モードタブがある

## TC-005: モードタブの切り替え（BM, MR, GP）
- **URL**: /tournaments/[id]/bm, /mr, /gp
- **authRequired**: false
- **手順**:
  1. トーナメント詳細ページからBMタブをクリック
  2. BM ページが表示されるか確認
  3. MR タブをクリック
  4. GP タブをクリック
- **期待結果**: 各モードタブで正常にページ遷移できる

## TC-006: 言語切り替え（日本語 <-> 英語）
- **URL**: /
- **authRequired**: false
- **手順**:
  1. トップページにアクセス
  2. 言語切り替えボタンをクリック
  3. テキストが切り替わるか確認
  4. 再度切り替えて元に戻るか確認
- **期待結果**: 日本語/英語の切り替えが正常に動作する

## TC-007: サインインページの表示
- **URL**: /auth/signin
- **authRequired**: false
- **手順**:
  1. https://preview.smkc.bluemoon.works/auth/signin にアクセス
  2. Player タブ（ニックネーム + パスワード）が表示されるか
  3. Admin タブ（Discord OAuth）が表示されるか
  4. フォーム要素が正しく存在するか
- **期待結果**: サインインページが正常に表示される

## TC-2070A: 認証エラーページの安全な表示と復帰導線
- **URL**: /auth/error?error=CredentialsSignin, /auth/error?error=NotWhitelisted
- **authRequired**: false
- **背景**: issue #2070。NextAuth のエラー遷移先 `/auth/error` は、認証失敗理由を安全な文言で表示し、再ログインとトップページへの復帰導線を提供する必要がある。`/auth/signin` だけではこの実ページを確認できない。
- **手順**:
  1. `/auth/error?error=CredentialsSignin` にアクセスする
  2. 認証エラー見出し、資格情報エラーの文言、`/auth/signin` と `/` へのリンクを確認する
  3. `/auth/error?error=NotWhitelisted` にアクセスする
  4. 管理者未登録の安全な説明文と復帰導線を確認する
- **期待結果**: エラー詳細はユーザー向けの安全な文言で表示され、再ログインとトップページへのリンクが常に存在する
- **スクリプト**: tc-all.js TC-2070A

## TC-2070B: Web Vitals ingestion は通常設定で 204 を返しページ表示を壊さない
- **URL**: /api/internal/vitals, /
- **authRequired**: false
- **背景**: issue #2070。`WebVitalsReporter` は root layout に常時マウントされるが、通常環境では `PERF_LOG !== '1'` のため `/api/internal/vitals` が副作用なしに 204 を返すことを preview で確認する。`PERF_LOG=1` のログ内容は環境依存なので単体テストで補助する。
- **手順**:
  1. ブラウザコンテキストから `/api/internal/vitals` に最小 payload を POST する
  2. 通常 preview 設定で 204 が返ることを確認する
  3. トップページに遷移し、Web Vitals reporter のマウントでページロードが壊れないことを確認する
- **期待結果**: 通常設定では vitals endpoint は 204 を返し、トップページは JS エラーなしに表示される
- **スクリプト**: tc-all.js TC-2070B
- **補助検証**: `smkc-score-app/__tests__/app/api/internal/vitals/route.test.ts`

## TC-2078: TA preview suite は 35分 soft timeout で中断しない
- **URL**: n/a (runner configuration / preview suite)
- **authRequired**: true (admin profile for full preview run)
- **背景**: issue #2078。TA suite は 29ケースを持ち、共有28人fixture、isolated tournament、phase-chain coverage を維持するため preview では 35分上限を超えることがある。通常の `npm run e2e:preview:all` / `npm run e2e:preview:ta` で `[TA] suite timed out after 35m` を出して残りケースを soft abort しないよう、TA suite は明示的な実行時間上限を持つ。
- **手順**:
  1. `tc-ta.js` の suite 設定を読み込む
  2. TA suite が 29ケースを維持していることを確認する
  3. TA suite 固有の timeout が 35分より長く、`TC-1005` まで実行対象に残ることを確認する
  4. runner の `E2E_SUITE_TIMEOUT_MS` override が TA 固有 timeout より優先されることを確認する
  5. runner の明示 timeout fallback は `null` / `undefined` のときだけ既定値を使い、`0` を `DEFAULT_SUITE_TIMEOUT_MS` に置き換えないことを確認する
- **期待結果**: TA preview suite は通常設定で 75分上限を使い、phase-chain/isolated fixture coverage を削らずに `TC-1005` まで実行できる。issue #2111 の nullish fallback 契約により、将来の明示的な falsy timeout 値も OR fallback で失われない
- **スクリプト**: `npm run e2e:preview:ta` / `npm test -- --runTestsByPath __tests__/e2e/ta-suite-timeout.test.ts __tests__/lib/e2e-runner-timeout.test.ts`

## TC-2161: Preview D1 schema preflight は Wrangler 認証失敗だけで E2E 本体を止めない
- **URL**: n/a (runner configuration / preview suite)
- **authRequired**: true (Cloudflare D1 token is optional unless strict preflight is requested)
- **背景**: issue #2161。Preview D1 schema preflight は schema drift を早期検出するために `wrangler d1 execute --remote --env preview --json` を実行するが、automation 環境で Wrangler refresh token が 401 になった場合は remote schema drift が確認できていない。認証/ログ初期化だけの失敗は E2E ブラウザ起動を妨げず、strict 確認が必要な環境だけ `E2E_REQUIRE_PREVIEW_SCHEMA_PREFLIGHT=1` で hard fail に戻せる必要がある。
- **手順**:
  1. Wrangler が `Failed to fetch auth token: 401 Unauthorized` を返す preflight を模擬する
  2. 通常の `npm run e2e:preview:all` 相当では警告を出して preflight を通過することを確認する
  3. `E2E_REQUIRE_PREVIEW_SCHEMA_PREFLIGHT=1` 指定時は同じ auth/log failure がブラウザ起動前に失敗することを確認する
  4. auth/log failure の message/strict 判定 helper は public export せず、private helper のまま runner 経由で検証することを確認する
- **期待結果**: 認証/ログ初期化だけの失敗は通常 preview E2E を本体開始前に止めず、schema missing / SQLite error / timeout / strict preflight は従来どおり診断つきで失敗する。TC-2161 の E2E scenario 文字列確認は `preview-schema-preflight.test.ts` 側に集約し、drift test は preview preflight 実装と補助テストの対応だけを監視する
- **スクリプト**: `npm run e2e:preview:all` / `npm test -- --runTestsByPath __tests__/e2e/preview-schema-preflight.test.ts`

## TC-008: Overall Ranking ページの表示
- **URL**: /tournaments/[id]/overall-ranking
- **authRequired**: false
- **手順**:
  1. トーナメントの総合ランキングページにアクセス
  2. ランキング表が表示されるか確認
- **期待結果**: 総合ランキングが表示される

## TC-009: HTTPS接続の確認
- **URL**: /
- **authRequired**: false
- **手順**:
  1. https://preview.smkc.bluemoon.works/ にアクセス
  2. URLがhttps://で始まるか確認
- **期待結果**: HTTPS接続が使用されている

## TC-010: JavaScriptエラーの確認
- **URL**: / (全ページ共通)
- **authRequired**: false
- **手順**:
  1. ブラウザコンソールを監視しながら各ページを巡回
  2. 重大なJSエラーがないか確認
- **期待結果**: 重大なJSエラーがない

## TC-011: レスポンシブデザインの確認
- **URL**: /
- **authRequired**: false
- **手順**:
  1. モバイルビューポート（375px）でトップページを確認
  2. ナビゲーションが適切に表示されるか
- **期待結果**: モバイルでも正常に表示される

## TC-012: ナビゲーション全体フロー
- **URL**: / -> /players -> /tournaments -> /tournaments/[id]
- **authRequired**: false
- **手順**:
  1. トップページからPlayersリンクをクリック
  2. Playersページ確認後、Tournamentsリンクをクリック
  3. トーナメント一覧からトーナメントをクリック
  4. トーナメント詳細確認後、トップに戻る
- **期待結果**: 全ナビゲーションが正常に動作する

---

## 認証済みテスト（admin ログイン必須）

## TC-101: プレイヤー追加
- **URL**: /players
- **authRequired**: true (admin)
- **手順**:
  1. プレイヤーページで「プレイヤー追加」ボタンをクリック
  2. 氏名・ニックネーム・国を入力してフォーム送信
  3. 一時パスワードダイアログが表示されることを確認
  4. パスワードをコピー可能であることを確認
  5. ダイアログを閉じた後、リストにプレイヤーが表示されることを確認
- **期待結果**: プレイヤーが作成され、一時パスワードが表示される
- **回帰チェック**: Workers 1101 リトライが機能すること

## TC-102: プレイヤー編集
- **URL**: /players
- **authRequired**: true (admin)
- **手順**:
  1. プレイヤー行の「編集」ボタンをクリック
  2. 編集ダイアログが開くことを確認（ページ全体がスケルトンにならない）
  3. 氏名を変更して保存
  4. リストに変更が反映されることを確認
- **期待結果**: 編集が成功し、ページがスケルトンにならない

## TC-103: プレイヤーパスワードリセット
- **URL**: /players
- **authRequired**: true (admin)
- **手順**:
  1. プレイヤー行の「パスワード再発行」ボタンをクリック
  2. 確認ダイアログで「OK」をクリック
  3. 「パスワードのリセットに成功しました」ダイアログが表示されること
  4. 新しい一時パスワードが表示されることを確認
  5. パスワードをコピー可能であることを確認
- **期待結果**: パスワードがリセットされ、新しい一時パスワードが表示される

## TC-104: プレイヤー削除
- **URL**: /players
- **authRequired**: true (admin)
- **手順**:
  1. プレイヤー行の「削除」ボタンをクリック
  2. 確認ダイアログで「OK」をクリック
  3. リストからプレイヤーが消えることを確認
- **期待結果**: プレイヤーが削除される。失敗時はエラーが表示される

## TC-105: セキュリティヘッダー確認
- **URL**: /
- **authRequired**: false
- **手順**:
  1. ホームページのレスポンスヘッダーを確認
  2. Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy が存在すること
  3. X-Powered-By ヘッダーが存在しないこと
- **期待結果**: 全セキュリティヘッダーが付与されている

## TC-106: パスワードハッシュ漏洩チェック
- **URL**: /api/tournaments/[id]/bm, /api/players
- **authRequired**: true (admin)
- **手順**:
  1. 認証済み状態で各API エンドポイントを呼び出す
  2. レスポンスに `password` フィールドが含まれないことを確認
  3. レスポンスに bcrypt ハッシュ ($2b$) が含まれないことを確認
- **期待結果**: パスワードハッシュがAPIレスポンスに含まれない

## TC-107: エラーメッセージ統一チェック
- **URL**: /api/tournaments/[id]/ta/standings, bm/standings, mr/standings, gp/standings
- **authRequired**: false
- **手順**:
  1. 未認証状態で各standings APIを呼び出す
  2. 全て `"error": "Forbidden"` を返すことを確認
- **期待結果**: 全エンドポイントで統一された "Forbidden" メッセージ

## TC-108: Players API ページネーション
- **URL**: /api/players, /players
- **authRequired**: false
- **背景**: コミット 0269c8f で Players ページがページネーション化された。`page`/`limit` クエリで分割取得し `{ data, meta: { total, page, limit, totalPages } }` を返す契約を `tc-all.js` で検証する
- **手順**:
  1. `/api/players?page=1&limit=10` を GET し、`data` が10件以下、`meta.page=1`, `meta.limit=10`, `meta.total>=data.length`, `meta.totalPages=Math.ceil(total/10)` であることを確認
  2. `/api/players?page=2&limit=10` を GET し、1ページ目と異なる ID のレコードが返ること
  3. `/api/players?page=1&limit=200` を GET → 200 を要求しても `meta.limit<=100` にクランプされること
  4. `/players` ページを開き、プレイヤー数が既定 limit (50) を超える場合にページャー UI が出ること
- **期待結果**: ページネーションが API/UI 双方で機能し、limit クランプが効いている

## TC-109: Preview E2E 公式 alias と起動前 preflight
- **URL**: n/a (runner command)
- **authRequired**: true (admin profile)
- **背景**: preview 環境移行後、自動化手順は `npm run e2e:preview` を公式入口として扱う。runner は preview URL/profile を設定し、Chromium 起動前に host 解決を行う。macOS の installed Chrome は Crashpad がユーザーホーム配下を参照して abort することがあるため、自動 fallback ではなく明示指定時のみ使用する。
- **手順**:
  1. `smkc-score-app/` で `npm run e2e:preview` を実行する
  2. 互換 alias の `npm run e2e:preview:all` は同じ runner コマンドを重複定義せず、`npm run e2e:preview --` に委譲していることを確認する
  3. runner が `https://preview.smkc.bluemoon.works` と `/tmp/playwright-smkc-preview-profile` を選ぶことを確認する
  4. preview host が通常 DNS または public DNS fallback で解決できることを確認する
  5. public DNS fallback は IPv4 A レコードがない host でも IPv6 AAAA レコードを解決できることを確認する
  6. public DNS fallback は `dig +short` の説明行や不正な IPv4/IPv6 風文字列を host resolver rules に採用しないことを確認する
  7. macOS で `/Applications/Google Chrome.app` が存在しても、runner が自動で `E2E_BROWSER_CHANNEL=chrome` を設定しないことを確認する
  8. browser launch config が Crashpad を自動テスト向けに無効化し、crash dump path を writable な E2E browser home 配下へ固定することを確認する
  9. Chromium 引数生成はディレクトリ作成などの I/O を行わず、launch config 作成時に必要な browser home / cache / Crashpad ディレクトリを準備することを確認する
  10. `E2E_BROWSER_CHANNEL=chrome` または `E2E_EXECUTABLE_PATH=...` を明示した場合だけ、その指定が子プロセスへ渡ることを確認する
  11. `npm run e2e:install-browser` と preview runner が同じ `PLAYWRIGHT_BROWSERS_PATH` を使い、`playwright` import 前に子プロセスへ渡ることを補助検証で確認する
  12. run-preview 側の Crashpad launch helper 補助テストは `fs.mkdirSync` をモックし、実際の `/tmp` 配下へテスト副作用を残さないことを確認する
- **期待結果**: alias が存在し、TC 本体に入る前の missing script / DNS / Crashpad permission failure で停止しない
- **スクリプト**: `npm run e2e:preview`, `npm run e2e:preview:all`
- **補助検証**: `smkc-score-app/__tests__/e2e/run-preview.test.ts`, `smkc-score-app/__tests__/lib/e2e-browser-launch.test.ts`（どちらも runner command 扱いで、URL 欄には環境変数名を入れない）

## TC-111: Preview D1 schema preflight
- **URL**: n/a (runner command)
- **authRequired**: true (admin profile)
- **背景**: Preview D1 は wrangler migration の適用状況と Prisma schema がずれると、`npm run e2e:preview:all` がブラウザ起動後に 500 で大量失敗する。`Tournament.publicModes`、`GPMatch.assignedCups`、`GPMatch.suddenDeathWinnerId` は過去に preview で欠落または確認漏れし、GP finals POST/GET が 500 に見える原因になるため、runner が起動前に必須カラムを検査する。
- **手順**:
  1. `smkc-score-app/` で `npm run e2e:preview` を実行する
  2. runner が `wrangler d1 execute DB --remote --env preview --json` で `Tournament.publicModes`、`GPMatch.assignedCups`、`GPMatch.suddenDeathWinnerId` を確認する
  3. 必須カラムが欠落している場合はブラウザを起動せず、`npm run db:migrations:apply:preview` を促すエラーで停止することを確認する
  4. Wrangler の auth token 取得失敗や log file 書き込み失敗は schema 欠落として扱わず、`wrangler login` / `CLOUDFLARE_API_TOKEN` と `WRANGLER_LOG_PATH` の確認を促すことを確認する
  5. runner が `WRANGLER_LOG_PATH` 未指定時に writable な一時ログパスを渡し、`~/Library/Preferences/.wrangler/logs` 権限で停止しないことを確認する
  6. Wrangler が stderr/stdout なしで一時的に exit 1 を返した場合は1回だけ再試行し、再失敗時も schema drift と断定せず command/status/stdout/stderr の診断を出すことを確認する
  7. schema drift と明確に判定できる stderr または必須カラム欠落時のみ `npm run db:migrations:apply:preview` を促すことを確認する
  8. `GPMatch.assignedCups` と `GPMatch.suddenDeathWinnerId` が wrangler-format migration にも存在することを確認する
- **期待結果**: preview D1 schema drift は TC 本体の 500 ではなく、起動前 preflight の明示エラーとして検出される
- **スクリプト**: `npm run e2e:preview`, `npm run e2e:preview:all`
- **補助検証**: `smkc-score-app/__tests__/e2e/preview-schema-preflight.test.ts`

## TC-2034: TC-109 drift guard は補助テストの実装文字列を固定しない
- **URL**: n/a (static/doc coverage)
- **authRequired**: false
- **背景**: issue #2034。TC-109 の run-preview Crashpad 補助テストは `fs.mkdirSync` の副作用を防ぐ挙動を `run-preview.test.ts` 側で直接検証している。`e2e-cases-drift.test.ts` は E2E シナリオ文書と補助テスト分類の対応を守るためのもので、補助テスト内の変数名や `toHaveBeenCalledWith` の具体的な書き方を重複検査すると、挙動を変えないリファクタリングで誤検出する。
- **手順**:
  1. TC-109 のシナリオに `fs.mkdirSync` モックと `/tmp` 副作用防止の要件が残っていることを確認する
  2. TC-109 の補助検証分類が `run-preview.test.ts` と `e2e-browser-launch.test.ts` を runner command 扱いで参照していることを確認する
  3. drift guard が `run-preview.test.ts` の具体的な変数名・アサーション文字列を直接検査していないことを確認する
- **期待結果**: TC-109 の文書連携は維持され、補助テスト内の安全なリネームや整形では drift guard が壊れない
- **スクリプト**: `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`

## TC-2041: TC-109 drift guard の境界は専用アンカーで固定する
- **URL**: n/a (static/doc coverage)
- **authRequired**: false
- **背景**: issue #2041/#2039。TC-2034 の drift guard は `e2e-cases-drift.test.ts` 自身の一部を検査するが、`it(...)` 名を `sectionBetween()` の境界に使うと、テスト名リネームや並び替えで不要に壊れやすい。
- **手順**:
  1. TC-109 helper coverage の検査ブロックが `TC109-HELPER-COVERAGE-DRIFT-GUARD-START/END` の専用コメントアンカーで囲まれていることを確認する
  2. TC-2034 drift guard が `sectionBetween()` の境界に `it(...)` 名ではなく専用コメントアンカーを使うことを確認する
  3. `sectionBetween()` helper が専用アンカー間の本文を返し、欠落した end marker では失敗することを補助検証で確認する
- **期待結果**: TC-109 の drift guard はテスト名の安全なリネームや近接テストの並び替えに依存しない
- **スクリプト**: `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`
- **補助検証**: `smkc-score-app/__tests__/helpers/e2e-cases.test.ts`

## TC-110: Preview 管理者ログイン補助スクリプトの要素待機
- **URL**: /auth/signin
- **authRequired**: false (ログイン準備)
- **背景**: preview E2E は永続プロファイルの Discord 管理者セッションを前提にする。`npm run e2e:preview:login` は手動ログイン用にサインイン画面を開くため、ページロード後の固定 sleep ではなく、実際の Admin タブと Discord ログインボタンの表示を待つ必要がある。Discord OAuth 遷移中は Playwright の実行コンテキストが一時的に破棄されるため、認証確認ポーリングはその一時エラーで終了してはいけない。
- **手順**:
  1. `smkc-score-app/` で `npm run e2e:preview:login` を実行する
  2. script が `/auth/signin` を開くことを確認する
  3. Admin タブが表示されるまで待ち、Admin タブを選択することを確認する
  4. Discord ログインボタンが表示されるまで待つことを確認する
  5. 固定の `waitForTimeout(1500)` に依存しないことを確認する
  6. OAuth 遷移中の `Execution context was destroyed` や一時的な page close は未認証扱いにして、手動ログイン待ちを続けることを確認する
- **期待結果**: preview ログイン補助はページ描画速度に左右されず、Discord 管理者ログイン操作を開始できる
- **補助検証**: `smkc-score-app/__tests__/e2e/login-preview-admin.test.ts`

## TC-359: CDM Export 失敗時の原因ヒント表示
- **URL**: /tournaments/[id]
- **authRequired**: true (admin)
- **手順**:
  1. トーナメント詳細ページにアクセス
  2. CDM Export API が 403 を返す状態を作る
  3. CDM Export ボタンをクリック
  4. エラー alert の文言を確認
- **期待結果**: 汎用エラーだけではなく、Forbidden / セッション切れなど原因を切り分けられるヒントが表示される

## TC-360: CDM Export 進行中表示と連打防止
- **URL**: /tournaments/[id]
- **authRequired**: true (admin)
- **背景**: CDM エクスポートは workbook 生成とダウンロードに時間がかかるため、クリック後に進行中であることを表示し、二重クリックで重複リクエストを送らない。
- **手順**:
  1. 管理者で大会詳細ページを開く
  2. CDM Export API のレスポンスを一時的に遅延させる
  3. `CDM Export` ボタンをクリック
  4. API 応答前にボタンの状態とリクエスト数を確認
- **期待結果**: ボタンが `Exporting...` 表示になり disabled/`aria-busy=true` になる。遅延中に二重クリックしても `/export?format=cdm` リクエストは1回だけ送信される。
- **スクリプト**: tc-all.js TC-360

## TC-361: CDM Export エラー後の再試行
- **URL**: /tournaments/[id]
- **authRequired**: true (admin)
- **背景**: CDM エクスポート API が失敗しても、ボタンが disabled のまま残ると管理者が再試行できない。
- **手順**:
  1. 管理者で大会詳細ページを開く
  2. CDM Export API が 500 を返す状態を作る
  3. `CDM Export` ボタンをクリック
  4. エラー alert 表示後のボタン状態を確認し、もう一度クリックする
- **期待結果**: エラー alert が表示され、ボタンは disabled 解除かつ `aria-busy=false` になる。再クリックで `/export?format=cdm` リクエストが再送される。
- **スクリプト**: tc-all.js TC-361

## TC-201: 各モードページのデータ読み込み確認
- **URL**: /tournaments/[id]/ta, /bm, /mr, /gp
- **authRequired**: true (admin)
- **重要**: ページの中身を必ず確認すること（HTTPステータスだけでは不十分）
- **手順**:
  1. TA ページにアクセスし、8秒待機
  2. 「Failed to fetch」エラーが表示されていないこと
  3. トーナメント名が表示されていること
  4. モードタブが表示されていること
  5. BM, MR, GP ページも同様に確認
- **期待結果**: 全モードでエラーなくデータが読み込まれる
- **回帰チェック**: fetchWithRetry が Workers 1101 を吸収していること

## TC-202: トーナメント一覧のデータ読み込み
- **URL**: /tournaments
- **authRequired**: false
- **手順**:
  1. トーナメント一覧ページにアクセス
  2. 「読み込み中」が5秒以内に消えること
  3. トーナメント名（test jsmkc 等）が表示されること
- **期待結果**: トーナメント一覧がエラーなく表示される

## TC-203: 総合ランキングページの表示
- **URL**: /tournaments/[id]/overall-ranking
- **authRequired**: false
- **手順**:
  1. 総合ランキングページにアクセス
  2. 「トーナメントが見つかりません」が表示されないこと
  3. 「総合ランキング」タイトルが表示されること
- **期待結果**: ランキングページがレイアウトごと正常表示される

---

## 回帰テスト（過去のissueから）

## TC-304: 観覧者向け空グループメッセージ (#251)
- **URL**: /tournaments/[id]/mr (グループ未設定時)
- **authRequired**: false
- **手順**:
  1. グループ未設定のモードページを非ログイン状態で表示
  2. メッセージが「Please wait until the setup is complete.」であること
- **期待結果**: 「Click Setup Groups to begin.」が非管理者に表示されないこと

## TC-305: BMグループ設定ダイアログの動作 (#252)
- **URL**: /tournaments/[id]/bm
- **authRequired**: true (admin)
- **手順**:
  1. BMページで「グループ編集」ボタンをクリック
  2. ダイアログが開くことを確認
  3. 「グループ更新」ボタンをクリック
  4. ボタンが保存中にdisabledになること
  5. 保存後にダイアログが閉じること
  6. エラー時はエラーメッセージがalertで表示されること
- **期待結果**: ダイアログが正常に閉じ、保存中はボタンが無効化される

## TC-1075: BMグループ設定ダイアログのシード順2グループ蛇腹配分
- **URL**: /tournaments/[temp-id]/bm
- **authRequired**: true (admin)
- **背景**: issue #1075。グループ分けアルゴリズムは §10.2 の蛇腹方式だが、現在のUIは3+グループ仕様確定まで2グループ固定であるため、UIの「シード順で振分け」操作から保存された2グループ配分結果をE2Eで固定する必要がある。
- **手順**:
  1. 管理者で一時トーナメントと検証用プレイヤー8名を用意する
  2. BMグループ設定ダイアログで8名を選択し、シード1〜8を入力する
  3. 固定グループ数2のまま「シード順で振分け」を押して保存する
  4. BM API の qualifications を取得し、シードごとのグループを確認する
- **期待結果**: シード1→A、2→B、3→B、4→A、5→A、6→B、7→B、8→A となり、A/B が各4名になる
- **スクリプト**: tc-all.js TC-1075

## TC-307: BM/MR/GP スコア入力リンク (#253)
- **URL**: /tournaments/[id]/bm, /mr, /gp
- **authRequired**: false
- **手順**:
  1. BM予選ページに「Enter Score」ボタンが表示されること
  2. クリックすると /bm/participant に遷移すること
  3. MR、GPページでも同様にリンクが存在すること
- **期待結果**: 全3モードでスコア入力ページへのリンクが表示される

## TC-308: Players APIレスポンス形式 (#254, #257)
- **URL**: /api/players
- **authRequired**: false
- **手順**:
  1. `/api/players` をGETで呼び出す
  2. レスポンスが `{ success: true, data: [...], meta: {...} }` 形式であること
  3. `data.data` のような二重ラッピングがないこと
- **期待結果**: フラットな `{ success, data, meta }` 構造

## TC-309: パスワードリセットAPIレスポンス形式 (#254)
- **URL**: /api/players/[id]/reset-password
- **authRequired**: true (admin)
- **手順**:
  1. テストプレイヤーを作成
  2. パスワードリセットAPIを呼び出す
  3. レスポンスが `{ success: true, data: { temporaryPassword: "..." } }` 形式であること
  4. テストプレイヤーを削除
- **期待結果**: `createSuccessResponse` でラップされたレスポンス

## TC-310: プレイヤーログインからGP入力導線まで (#288)
- **URL**: /auth/signin -> /tournaments/[id]/gp -> /tournaments/[id]/gp/participant
- **authRequired**: true (player)
- **手順**:
  1. 管理者セッションでテストプレイヤーを作成し、一時パスワードを取得する
  2. 永続プロファイルとは別の一時ブラウザコンテキストで `/auth/signin` を開く
  3. プレイヤータブでニックネームと一時パスワードを入力し、ログインする
  4. `/tournaments/[id]/gp` を開き、「スコア入力」ボタンをクリックする
  5. `/gp/participant` に遷移し、ログイン必須画面ではなく participant 画面が表示されることを確認する
- **期待結果**: プレイヤー credentials ログイン後、GP の participant 導線をそのまま辿れて、`プレイヤーとしてログイン中` が表示される

## TC-311: GP participant ページから実際にスコア送信できる (#288)
- **URL**: /auth/signin -> /tournaments/[temp-id]/gp/participant
- **authRequired**: true (player)
- **手順**:
  1. 管理者セッションで一時トーナメントと対戦用プレイヤーを作成する
  2. 一時トーナメントで GP 予選をセットアップし、対象プレイヤーに pending match を作る
  3. 別の一時ブラウザコンテキストで対象プレイヤーとしてログインする
  4. `/gp/participant` を開き、ドライバーズポイントの合計入力欄が表示されていることを確認する
  5. 両プレイヤーのドライバーズポイント合計を入力して送信する
  6. participant ページで pending match が消えることと、管理者 API 側で match が `completed` になり合計点が保存されていることを確認する
  7. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: GP の participant 入力フォームでコースごとのリザルトなしにドライバーズポイント合計を送信・永続化できる

## TC-312: TA ノックアウト開始後はプレイヤーが予選タイムを編集できない
- **URL**: /auth/signin -> /tournaments/[temp-id]/ta/participant
- **authRequired**: true (player + admin setup)
- **手順**:
  1. 管理者セッションで一時トーナメントを作成し、対象プレイヤーを TA 予選に登録する
  2. 管理者 API で対象プレイヤーの qualification entry に `rank=17` と有効な `totalTime` を設定する
  3. `/api/tournaments/[temp-id]/ta/phases` に `promote_phase1` を送ってノックアウトを開始する
  4. 別の一時ブラウザコンテキストで対象プレイヤーとしてログインし、`/ta/participant` を開く
  5. 「ノックアウト開始後は管理者のみ修正可」の警告が表示され、入力欄と送信ボタンが無効化されていることを確認する
  6. 一時トーナメントを削除する
- **期待結果**: ノックアウト開始後、プレイヤーは予選タイムを編集できず、管理者のみが修正可能である

## TC-313: TA 本線開始後は予選にプレイヤー追加できない
- **URL**: /tournaments/[temp-id]/ta
- **authRequired**: true (admin)
- **手順**:
  1. 管理者セッションで一時トーナメントを作成し、対象プレイヤーを TA 予選に登録する
  2. 管理者 API で対象プレイヤーの qualification entry に `rank=17` と有効な `totalTime` を設定する
  3. `/api/tournaments/[temp-id]/ta/phases` に `promote_phase1` を送って本線を開始する
  4. 管理者で `/ta` を開き、「プレイヤー追加」ボタンがロック状態であることを確認する
  5. 「プレイヤー追加」を押した時に「本線開始後は予選へのプレイヤー追加はできません」の toast が表示されることを確認する
  6. 一時トーナメントを削除する
- **期待結果**: 本線開始後は管理者でも予選にプレイヤーを追加できず、理由は常時表示ではなく操作時に分かる

## TC-314: TA フェーズ3で提出済みラウンドを取り消せる
- **URL**: /tournaments/[temp-id]/ta/finals
- **authRequired**: true (admin)
- **手順**:
  1. 管理者セッションで一時トーナメントと検証用プレイヤー2名を用意し、両者を TA 予選に登録する
  2. 両方の qualification entry に有効な `times` / `totalTime` と `rank=1,2` を設定する
  3. `/api/tournaments/[temp-id]/ta/phases` に `promote_phase3` を送ってフェーズ3を開始する
  4. `/ta/finals` を開いて「ラウンド 1 開始」から 2 名分のタイムを入力し、結果を送信する
  5. 送信後に「直前ラウンドを取り消す」ボタンが表示されることを確認し、実行する
  6. ラウンドが入力状態に戻り、再入力用のタイム欄と「ラウンドキャンセル」ボタンが復帰することを確認する
  7. 一時トーナメントと追加プレイヤーを削除する
- **期待結果**: フェーズ3でも提出済みラウンドを UI から取り消せ、直前ラウンドをやり直せる

## TC-317: TA シーディング CRUD — update_seeding が TTEntry に永続化される
- **URL**: /api/tournaments/[temp-id]/ta + /api/tournaments/[temp-id]/ta/entries
- **authRequired**: true (admin)
- **手順**:
  1. テスト用トーナメント + プレイヤー1名を作成し、TA 予選エントリーを seeding=3 で作成
  2. GET /ta で初期シーディングが 3 であることを確認
  3. update_seeding API でシーディングを 7 に更新
  4. GET /ta でシーディングが 7 に更新されていることを確認
  5. update_seeding でシーディングを null にクリア
  6. GET /ta でシーディングが null であることを確認
  7. クリーンアップ
- **期待結果**: update_seeding PUT → GET で永続化が確認できる

## TC-318: TA ペア割り当て — set_partner + パートナーが互いのタイムを編集できる
- **URL**: /api/tournaments/[temp-id]/ta (PUT set_partner) + /api/tournaments/[temp-id]/ta/entries/[entryId]
- **authRequired**: true (admin + player)
- **背景**: TA 予選ではペア制（partnerId）を採用しており、ペアになったプレイヤー同士は互いのタイムを代理入力できる。TC-803 のカバレッジ範囲
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー2名（メイン + パートナー）を作成し、TA エントリーを追加する
  2. `PUT /api/tournaments/[id]/ta` `{ action: 'set_partner', entryId, partnerId }` を実行し、200 が返ることを確認する（step1）
  3. GET /ta で entry1.partnerId === partnerId かつ entry2.partnerId === mainPlayerId の双方向ペアが設定されていることを確認する（step2）
  4. 別の一時ブラウザでパートナーとしてログインし、メインプレイヤーのエントリー（entry1）の MC1 タイムを `PUT .../entries/[entry1.id]` で編集する → 200 が返ること（step3）
  5. GET /ta でメインプレイヤーの MC1 タイムが更新されていることを確認する（step4）
  6. クリーンアップ（トーナメント + プレイヤー削除）
- **期待結果**: set_partner が双方向に反映され、パートナーがペアの相手のタイムを代理入力できる

## TC-319: TA taPlayerSelfEdit フラグ toggle — false でセルフ編集ブロック
- **URL**: /api/tournaments/[temp-id]/ta + /api/tournaments/[temp-id]/ta/entries/[entryId]
- **authRequired**: true (admin)
- **背景**: taPlayerSelfEdit=false のとき、参加者は自分のタイムを編集できない（パートナーは可能）。admin はこのフラグを無視して編集可能
- **手順**:
  1. taPlayerSelfEdit=false のトーナメントを作成
  2. プレイヤー2名でTAエントリー、ペア結成
  3. GET /ta で taPlayerSelfEdit === false を確認
  4. admin でタイム編集 PUT → 成功（admin bypass）
  5. PUT /tournaments/[id] で taPlayerSelfEdit=true にtoggle
  6. GET /ta で taPlayerSelfEdit === true を確認
  7. クリーンアップ
- **期待結果**: taPlayerSelfEdit フラグの取得と toggle が正しく動作する

## TC-315: BM/MR/GP グループ設定（奇数人数）でエラーが出ない
- **URL**: /tournaments/[id]/bm
- **authRequired**: true (admin)
- **背景**: 奇数人数でグループ設定するとBYEマッチ生成時に`player2Id='__BREAK__'`がD1のFK制約に違反し500エラーになっていた（migration 0013 で修正）
- **手順**:
  1. テスト用トーナメントを作成する
  2. プレイヤー3名（奇数）でBMグループ設定を送信する
  3. エラーアラートが表示されないことを確認
  4. 順位表に3名が表示され、BYEマッチ（不戦勝）が1件以上生成されること
  5. `/api/players` のレスポンスに `__BREAK__` が含まれないことを確認
  6. 作成したトーナメントを削除する
- **期待結果**: 奇数人数でも POST 201、グループ設定成功、アラートなし

## TC-316: BM 同順位タイバー初期非表示 → マッチ後表示
- **URL**: /tournaments/[temp-id]/bm
- **authRequired**: true (admin)
- **背景**: `filterActiveTiedIds` — mp=0（グループ未消化）では全プレイヤーが0-0で同城だが、`filterActiveTiedIds` が同城を抑制するためタイバーは表示されない。マッチ消化後（mp>=1）に同城が残っていれば同城バーが出る
- **手順**:
  1. テスト用トーナメント + プレイヤー4名を作成
  2. BMグループ設定（2名をグループAに接続）
  3. `/bm` 页面訪問 → 同順位バーが**表示されていない**ことを確認
  4. 2-2引き分けスコアを入力
  5. 再度 `/bm` を訪問 → 同順位バーが**表示されている**ことを確認
  6. クリーンアップ
- **期待結果**: mp=0 同順位バー非表示、マッチ後（mp>=1）同城が残っていればバー表示

## TC-324: BM 同順位バーが rankOverride 設定後に消える
- **URL**: /tournaments/[temp-id]/bm
- **authRequired**: true (admin)
- **背景**: 管理者が N-1 プレイヤーに rankOverride を設定して同城を解決した場合、同順位バーが非表示になることを確認
- **手順**:
  1. テスト用トーナメント + プレイヤー4名を作成
  2. 全員同じスコアになるようマッチを入力（同城状態）
  3. `/bm` 页面訪問 → 同順位バーが**表示されている**ことを確認
  4. N-1 プレイヤーの rankOverride を設定して同城を解決
  5. 再度 `/bm` を訪問 → 同順位バーが**消えている**ことを確認
  6. クリーンアップ
- **期待結果**: rankOverride 設定後の同城解决に応じてバーが消える

## TC-325: プロフィールページのセッション・プレイヤー情報表示
- **URL**: /profile
- **authRequired**: true (player or admin)
- **背景**: プレイヤーセッションでログインした際、プロフィールページにセッション情報とプレイヤー関連情報が正しく表示されること
- **手順**:
  1. プレイヤーまたは管理者としてログインする
  2. `/profile` にアクセスする
  3. ユーザー情報（name, role）が表示されることを確認
  4. プレイヤーセッションの場合、nickname と country が表示されることを確認
- **期待結果**: セッション種別に応じた情報が正しく表示される

## TC-326: トーナメントエクスポート API が有効な CSV を返す
- **URL**: /api/tournaments/[id]/export
- **authRequired**: true (admin)
- **背景**: 全モードのスコアを UTF-8 BOM 付き CSV でエクスポートできる
- **手順**:
  1. 管理者で `GET /api/tournaments/[id]/export` を呼び出す
  2. レスポンスステータスが 200 であることを確認
  3. `Content-Type: text/csv` ヘッダーが設定されていることを確認
  4. UTF-8 BOM (0xEF 0xBB 0xBF) がレスポンス先頭に付いていることを確認
  5. CSVの内容（プレイヤー名、スコア等）が空でないことを確認
- **期待結果**: UTF-8 BOM 付き CSV が返され Excelで正常に表示される

## TC-327: セッション状態 API がセッション情報を返す
- **URL**: /api/auth/session-status
- **authRequired**: false
- **背景**: 現在のセッション状態（認証の有無、ユーザー種別）を返す軽量なエンドポイント
- **手順**:
  1. 未認証状態で `GET /api/auth/session-status` を呼び出す
  2. レスポンスステータスが 200 であり、`authenticated: false` が含まれることを確認
  3. 管理者としてログイン後、同エンドポイントを呼び出す
  4. `authenticated: true` が含まれることを確認
- **期待結果**: セッション状態が正しくレスポンスに反映される

## TC-328: キャラクター統計 API — 管理者のみアクセス可・レスポンス形式確認
- **URL**: /api/players/[playerId]/character-stats
- **authRequired**: true (admin)
- **背景**: プレイヤーのキャラクター別使用統計（matchCount, winCount, winRate）を返すエンドポイント。管理者専用で未認証リクエストは 401/403 で拒否される
- **手順**:
  1. 管理者セッションで `GET /api/players/[playerId]/character-stats` を呼び出す
  2. レスポンスが `{ success: true, data: { playerId, characterStats: [...], ... } }` 形式であることを確認
  3. 未認証リクエストが 401 または 403 で拒否されることを確認
- **期待結果**: 管理者は characterStats 配列を取得できる。未認証は拒否される

## TC-329: スコア入力ログ API — 管理者のみ取得可・監査証跡確認
- **URL**: /api/tournaments/[id]/score-entry-logs
- **authRequired**: true (admin)
- **背景**: スコア入力の監査ログをマッチ別にグループ化して返すエンドポイント。管理者専用
- **手順**:
  1. 管理者セッションで `GET /api/tournaments/[id]/score-entry-logs` を呼び出す
  2. レスポンスが `{ success: true, data: { tournamentId, logsByMatch: {...}, totalCount: number } }` 形式であることを確認
  3. 未認証リクエストが 401 または 403 で拒否されることを確認
- **期待結果**: 管理者はスコア入力の監査ログを取得できる。未認証は拒否される

## TC-330: TA revival URL リダイレクト — revival-1→phase1, revival-2→phase2
- **URL**: /tournaments/[id]/ta/revival-1, /tournaments/[id]/ta/revival-2
- **authRequired**: false
- **背景**: revival_* URL は phase* URL に統一された際に旧パスが削除され、後方互換のためリダイレクトが実装されている
- **手順**:
  1. `/tournaments/[id]/ta/revival-1` にアクセスする
  2. `/tournaments/[id]/ta/phase1` にリダイレクトされることを確認
  3. `/tournaments/[id]/ta/revival-2` にアクセスする
  4. `/tournaments/[id]/ta/phase2` にリダイレクトされることを確認
- **期待結果**: 旧 revival-* URL が正しく phase* URL にリダイレクトされる

## TC-331: tt/entries 単一エントリ GET — player・tournament 関連データを含むレスポンス確認
- **URL**: /api/tournaments/[id]/tt/entries/[entryId]
- **authRequired**: true (admin)
- **背景**: `GET /api/tournaments/[id]/tt/entries/[entryId]` は個別の TTEntry を取得する。IDOR 保護（tournamentId が一致しない場合 404）と、関連 player・tournament を include した shape を返すことを確認する。また楽観的ロック (`version` フィールド) が存在することも検証する
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー1名を作成し、TA エントリーを追加する
  2. `GET /api/tournaments/[id]/tt/entries/[entryId]` を呼び出す
  3. ステータスが 200 かつ `{ success: true, data: { id, player: {...}, tournament: {...}, version: number, ... } }` 形式であることを確認する
  4. クリーンアップ
- **期待結果**: 単一エントリが player・tournament・version フィールドを含む正しい形式で返される

## TC-332: tt/entries 楽観的ロック競合 — stale version で PUT すると 409
- **URL**: /api/tournaments/[id]/tt/entries/[entryId]
- **authRequired**: true (admin)
- **背景**: `tt/entries/[entryId]` の PUT は楽観的ロックを採用しており、クライアントが読み取ったバージョンと DB 上のバージョンが一致しない場合 HTTP 409 Conflict を返す。これにより複数ユーザーの並行編集が互いを無言で上書きするのを防ぐ
- **手順**:
  1. 一時トーナメントにプレイヤー1名を追加し、TA エントリーを作成する
  2. `GET /api/tournaments/[id]/tt/entries/[entryId]` でエントリーと現在の `version` (例: 0) を取得する
  3. `PUT /api/tournaments/[id]/tt/entries/[entryId]` に `{ version: -1, times: {} }` (stale) を送信する
  4. HTTP 409 が返ることを確認する
  5. クリーンアップ
- **期待結果**: 古いバージョン番号での PUT が 409 Conflict で拒否される

## TC-333: ポーリング統計モニタ API — 認証ユーザーのみアクセス可・レスポンス形式確認
- **URL**: /api/monitor/polling-stats
- **authRequired**: true (any role)
- **背景**: `GET /api/monitor/polling-stats` は APIリクエスト量・応答時間・エラーレートなどの監視統計を返す。認証済みユーザーのみがアクセスできる（未認証は 401 で拒否）
- **手順**:
  1. 管理者セッションで `GET /api/monitor/polling-stats` を呼び出す
  2. ステータスが 200 かつ `{ success: true, data: { totalRequests, averageResponseTime, activeConnections, errorRate, warnings, timePeriod } }` 形式であることを確認する
  3. 未認証リクエストが 401 または 403 で拒否されることを確認する
- **期待結果**: 管理者は監視統計を取得できる。未認証リクエストは拒否される
- **スクリプト**: tc-all.js TC-333

## TC-334: トーナメント可視性 — 未公開トーナメントは未認証ユーザーにブロックされる
- **URL**: /api/tournaments/:id
- **authRequired**: false (unauthenticated access test)
- **背景**: `publicModes: []` のプライベートトーナメントは未認証ユーザーからは 403 で保護される。管理者は引き続きアクセスできる。
- **手順**:
  1. 管理者 API で新しいプライベートトーナメントを作成（publicModes デフォルト=[]）
  2. `https` モジュールで未認証 GET `/api/tournaments/:id` → 403 であることを確認
  3. 管理者セッションで同エンドポイントを GET → 200 であることを確認
- **期待結果**: 未認証: 403。管理者セッション: 200
- **スクリプト**: tc-all.js TC-334

## TC-335: トーナメント可視性切り替え — 管理者が最初のモードを公開すると未認証アクセスが許可される
- **URL**: /api/tournaments/:id, /api/tournaments (list)
- **authRequired**: true (admin PUT), then false (anon GET)
- **背景**: TC-334 の続き。`publicModes: ['ta']` に PUT して公開すると、未認証ユーザーが詳細 API と一覧 API で参照できるようになる。
- **手順**:
  1. TC-334 で作成したトーナメントに PUT `{ publicModes: ['ta'] }` を送信
  2. `https` モジュールで未認証 GET `/api/tournaments/:id?fields=summary` → 200 かつ `publicModes` に `'ta'` が含まれることを確認
  3. 未認証で GET `/api/tournaments` (一覧) → レスポンスにトーナメントが出現することを確認
- **期待結果**: 公開後は未認証ユーザーも詳細・一覧で参照可能
- **スクリプト**: tc-all.js TC-335

## TC-344: noCamera フラグ — 作成・取得・編集で正しく永続化される
- **URL**: /api/players (POST, GET, PUT)
- **authRequired**: true (admin)
- **背景**: プレイヤーの `noCamera` フラグはカメラ不参加プレイヤーを示す。作成時に `true` を設定し、GET で確認、PUT で `false` に更新・再確認するフルライフサイクルテスト。
- **手順**:
  1. POST `/api/players` `{ noCamera: true }` でプレイヤーを作成
  2. GET `/api/players/:id` → `data.noCamera === true` を確認
  3. PUT `/api/players/:id` `{ noCamera: false }` で更新 → レスポンスの `data.noCamera === false` を確認
  4. 再度 GET → `data.noCamera === false` を確認
  5. クリーンアップ（プレイヤー削除）
- **期待結果**: 作成・更新・取得の全段階で noCamera フラグが正しく反映される
- **スクリプト**: tc-all.js TC-344

## TC-345: BM 予選 — 同一ラウンドへの TV 番号重複割り当ての拒否 (issue #668)
- **URL**: /api/tournaments/[id]/bm PATCH
- **authRequired**: true (admin)
- **背景**: 予選マッチに TV 番号を割り当てる際、同じラウンド内で同じ TV 番号を 2 試合に割り当てると 400 で拒否される必要がある。
- **手順**:
  1. 4名のプレイヤーと独立トーナメントを作成
  2. BM グループを設定して試合を 2 つ生成
  3. PATCH で TV#1 を M1 に割り当て → 200
  4. PATCH で TV#1 を M2 に割り当て → 400（重複拒否）
  5. クリーンアップ
- **期待結果**: 同じラウンドへの TV 番号重複は 400 で拒否される
- **スクリプト**: tc-all.js TC-345

## TC-346: BM 決勝 — QF 試合完了後のルーザーズ R1 スロット TBD 検出 (issue #669)
- **URL**: /api/tournaments/[id]/bm/finals
- **authRequired**: true (admin)
- **背景**: ブラケット生成直後はルーザーズ R1 の player1Id === player2Id（プレースホルダー）。QF 1 試合が完了してルーザーが routing されると player1Id ≠ player2Id になる。
- **手順**:
  1. 8名ブラケット生成 → ルーザーズ R1 の player1Id === player2Id を確認
  2. QF M1 に有効スコアを PUT → ルーザーが losers_r1 にルーティング
  3. losers_r1 マッチの player1Id ≠ player2Id（片方は実プレイヤー）を確認
- **期待結果**: QF 完了後にルーザーズスロットが実プレイヤー ID に更新される
- **スクリプト**: tc-all.js TC-346

## TC-347: エクスポート API — CSV with BOM レスポンス確認
- **URL**: /api/tournaments/[id]/export
- **authRequired**: true (admin)
- **背景**: `GET /export` は UTF-8 BOM 付き CSV を返す。Content-Type 確認と CSV 形式（ヘッダー行）の確認。
- **手順**:
  1. 共有トーナメント ID で `GET /api/tournaments/:id/export`
  2. HTTP 200 かつ Content-Type が text/csv または application/csv であること
  3. レスポンスボディがカンマ区切り（ヘッダー行あり）であること
- **期待結果**: 200 + CSV Content-Type + ヘッダー行が返る
- **スクリプト**: tc-all.js TC-347

## TC-358: CDM エクスポートボタン — format=cdm が XLSM をダウンロードする
- **URL**: /api/tournaments/[id]/export?format=cdm
- **authRequired**: true (admin)
- **背景**: CDM 向けエクスポートはマクロ有効 Excel テンプレートを元に `.xlsm` ワークブックを返す。CSV エクスポートとは別に、管理者セッションのブラウザダウンロード経路が workbook 形式で成功することを確認する。
- **手順**:
  1. 管理者セッションで共有トーナメント ID を使う
  2. 大会詳細ページの `CDM Export` ボタンをクリックし、`GET /api/tournaments/:id/export?format=cdm` と download イベントを待つ
  3. HTTP 200 かつ Content-Type が `application/vnd.ms-excel.sheet.macroEnabled.12` であること
  4. `Content-Disposition` が attachment で、filename が `.xlsm` で終わること
  5. Playwright download の `suggestedFilename()` が `.xlsm` で終わること
  6. `download.path()` が取得でき、保存されたファイルが空でなく、XLSM/ZIP の先頭シグネチャ `PK` を持つこと
- **期待結果**: 認証済み管理者の CDM エクスポートが `.xlsm` としてダウンロードされる。`download.path()` が取得できない場合は、永続コンテキストの `acceptDownloads` 設定を確認できる診断メッセージで FAIL する。
- **スクリプト**: tc-all.js TC-358

## TC-816A: CDM export — finals をテンプレートの bracket 座標へ配置する
- **URL**: /api/tournaments/[id]/export?format=cdm
- **背景**: issue #816。CDM Finals シートは dense table ではなく固定 bracket レイアウトなので、match を順番に詰めると Barrage / Top 16 / Upper / Lower / GF / Reset の位置がずれる。
- **手順**:
  1. 共有大会の BM/MR/GP finals state を確認し、slot-mappable finals match がない mode は top 24 の finals を生成して CDM export fixture を準備する
  2. 生成後も finals match がない mode は、mode 別 match count と round 一覧を診断ログに出して失敗する
  3. BM/MR/GP Finals の round が `CDM_FINALS_BRACKET_SLOTS` の block/row 座標へ配置されることを確認する
  4. GP Finals の cupResults summary が移動先の bracket slot に残ることを確認する
- **期待結果**: finals match は CDM 2025 テンプレートの native bracket coordinates に配置され、GP の cup/points 補足情報も失われない
- **スクリプト**: `tc-all.js TC-816A`, `__tests__/e2e/tc-816a-cdm-finals-fixture.test.ts`, `__tests__/app/api/tournaments/[id]/export/route.test.ts`, `__tests__/docs/e2e-cases-drift.test.ts`

## TC-2088: CDM export — Main Hub は60人ちょうどで B62 を空のままにする
- **URL**: /api/tournaments/[id]/export?format=cdm
- **背景**: issue #2088。Main Hub の player rows は B2 から B61 までの60行に限定される。60人ちょうどの境界テストでは、最終行 B61 への書き込みだけでなく、範囲外の B62 が作成されないことも明示的に確認する必要がある。
- **手順**:
  1. CDM export fixture に TT entries を60人だけ用意する
  2. `GET /api/tournaments/:id/export?format=cdm` を実行する
  3. Main Hub の `B2` が1人目、`B61`/`C61` が60人目の name/nickname で埋まることを確認する
  4. Main Hub の `B62` が `undefined` のままであることを確認する
- **期待結果**: 60人ちょうどでは Main Hub の有効範囲だけが書き込まれ、61行目相当の `B62` は生成されない
- **スクリプト**: `__tests__/e2e/tc-2088-cdm-main-hub-boundary.test.ts`, `__tests__/app/api/tournaments/[id]/export/route.test.ts`

## TC-1877A: CDM export — grand_final_reset の正規化で到達不能条件を残さない
- **URL**: /api/tournaments/[id]/export?format=cdm
- **背景**: issue #1877。`grand_final_reset` は native slot table で先に解決されるため、同じ round 文字列を後段の別条件に残すと読み手に誤解を与える。
- **手順**:
  1. `cdmFinalsSlotRound` が slot table lookup 後に `bracketPosition.includes("reset")` だけで reset alias を扱うことを確認する
  2. `round === "grand_final_reset" || bracketPosition.includes("reset")` が残っていないことを確認する
- **期待結果**: grand_final_reset の正規化条件に到達不能な round 判定が残らない
- **スクリプト**: `__tests__/docs/e2e-cases-drift.test.ts`

## TC-1878A: CDM export — fallback 座標カウンタは unknown round だけで進める
- **URL**: /api/tournaments/[id]/export?format=cdm
- **背景**: issue #1878。既知 round が native slot に配置された後で unknown round が来ても、fallback の最初の空き座標から配置される必要がある。
- **手順**:
  1. `winners_qf` と、sort 順で `winners_qf` より後に来る `zz_custom_showmatch` を含む CDM export fixture を作る
  2. `winners_qf` が native slot `Y7` に配置されることを確認する
  3. `zz_custom_showmatch` が既知 round 数に影響されず fallback slot `D5` に配置されることを確認する
- **期待結果**: fallbackIndex は fallback 使用時だけ増え、unknown round の fallback 座標がずれない
- **スクリプト**: `__tests__/app/api/tournaments/[id]/export/route.test.ts`, `__tests__/docs/e2e-cases-drift.test.ts`

## TC-1879A: CDM export — E2E の座標期待値は route.ts と同期する前提を明記する
- **URL**: /api/tournaments/[id]/export?format=cdm
- **背景**: issue #1879。E2E は workbook を実際に読むが、期待セルの座標表は production の slot table と同期していないと誤検知を起こす。
- **手順**:
  1. `tc-all.js` の CDM Finals E2E slot table 付近に route.ts の `CDM_FINALS_BRACKET_SLOTS` と同期する旨のコメントがあることを確認する
  2. TC-816A が XLSM workbook を読み、座標表に基づいて BM/MR/GP のセル値を検証することを確認する
- **期待結果**: E2E の重複座標表は同期前提が明示され、乖離時のレビュー観点が残る
- **スクリプト**: `tc-all.js TC-816A`, `__tests__/docs/e2e-cases-drift.test.ts`

## TC-1880A: CDM export — GP cupResults がない環境でも座標検証を false failure にしない
- **URL**: /api/tournaments/[id]/export?format=cdm
- **背景**: issue #1880。GP finals に cupResults がない fixture でも、ブラケット座標自体が正しければ TC-816A は失敗すべきではない。
- **手順**:
  1. TC-816A の PASS 条件が `gpCupResultsChecked` を必須にしていないことを確認する
  2. `gpCupResultsChecked` が false の場合は detail に summary-cell check skipped として記録することを確認する
- **期待結果**: cupResults 検証は補助チェックになり、BM/MR/GP 座標検証が通れば TC-816A は PASS できる
- **スクリプト**: `tc-all.js TC-816A`, `__tests__/docs/e2e-cases-drift.test.ts`

## TC-2098A: CDM export — finals readiness state を並列取得する
- **URL**: /api/tournaments/[id]/export?format=cdm
- **背景**: issue #2098。TC-816A の fixture readiness は BM/MR/GP finals state をすべて必要とするため、逐次 `await` にすると D1/API 待ちがモード数ぶん積み上がる。
- **手順**:
  1. `ensureCdmE2eFinalsFixture` が BM/MR/GP finals state を `Promise.all` で取得することを確認する
  2. unit test で BM の fetch promise を保留しても MR/GP fetch が即時開始されることを確認する
- **期待結果**: readiness state の初回取得・再取得はモード間で並列に開始される
- **スクリプト**: `tc-all.js TC-816A`, `__tests__/e2e/tc-816a-cdm-finals-fixture.test.ts`, `__tests__/docs/e2e-cases-drift.test.ts`

## TC-2099A: CDM export — finals readiness round 計算で slotRound を再計算しない
- **URL**: /api/tournaments/[id]/export?format=cdm
- **背景**: issue #2099/#2100。`cdmE2eFinalsMatches` が slot-mappable match だけを扱う前提で、readiness details が `cdmE2eSlotRound` を再呼び出ししてから `.filter(Boolean)` するのは冗長で意図が読みにくい。
- **手順**:
  1. slot-mappable match と `slotRound` を共有する helper があることを確認する
  2. `cdmE2eFinalsReadinessDetails` が共有済み `slotRound` から rounds を作り、`.filter(Boolean)` を使わないことを確認する
- **期待結果**: readiness details は slot 判定を一度だけ行い、rounds は truthy な `slotRound` だけから組み立てられる
- **スクリプト**: `tc-all.js TC-816A`, `__tests__/e2e/tc-816a-cdm-finals-fixture.test.ts`, `__tests__/docs/e2e-cases-drift.test.ts`

## TC-2182A: CDM export — finals fixture 生成失敗を mode 別 status で報告する
- **URL**: /api/tournaments/[id]/export?format=cdm
- **背景**: issue #2182。TC-816A が不足モードの finals を自動生成するとき、POST の HTTP status/body を無視すると、後続の「match がない」診断だけでは失敗原因が追いにくい。
- **手順**:
  1. 不足モードの BM/MR/GP finals generation 結果を mode 名つきで検査する
  2. 200/201 以外の status では `CDM finals fixture generation failed` と mode/status/body を含むエラーを出す
  3. unit test で BM generation が 500 を返す場合の診断を確認する
- **期待結果**: fixture 生成APIの失敗は、workbook検証前に mode 別の具体的な HTTP status として報告される
- **スクリプト**: `tc-all.js TC-816A`, `__tests__/e2e/tc-816a-cdm-finals-fixture.test.ts`, `__tests__/docs/e2e-cases-drift.test.ts`

## TC-2187A: CDM export — TC-816A fixture helper の公開 API を最小化する
- **URL**: /api/tournaments/[id]/export?format=cdm
- **背景**: issue #2187。`fetchCdmE2eModeStates` と `generateCdmE2eMissingFinals` は `ensureCdmE2eFinalsFixture` の内部処理であり、直接 import するテストがない状態で `tc-all.js` の公開 API に出すと不要な依存先になる。
- **手順**:
  1. TC-816A が `ensureCdmE2eFinalsFixture` 経由で readiness fetch と不足 finals generation を検証することを確認する
  2. unit test で `tc-all.js` の module exports に `fetchCdmE2eModeStates` / `generateCdmE2eMissingFinals` が含まれないことを確認する
  3. `ensureCdmE2eFinalsFixture` は引き続き公開され、TC-816A の fixture 検証から利用できることを確認する
- **期待結果**: E2E helper の公開面は実際に外部テストが使う API に限定され、内部 helper への不要な直接依存を防げる
- **スクリプト**: `tc-all.js TC-816A`, `__tests__/e2e/tc-816a-cdm-finals-fixture.test.ts`, `__tests__/docs/e2e-cases-drift.test.ts`

## TC-817B: CDM export — CSV では CDM 専用 include を取得しない
- **URL**: /api/tournaments/[id]/export
- **背景**: issue #817。CSV 出力は MR/GP qualification seed、TT phase rounds、overall playerScores を使用しないため、CDM 専用 include を無条件に付けると不要な JOIN が増える。
- **手順**:
  1. `GET /api/tournaments/:id/export` を呼ぶ
  2. Prisma `findUnique` の include に `mrQualifications` / `gpQualifications` / `ttPhaseRounds` / `playerScores` が含まれないことを確認する
  3. `GET /api/tournaments/:id/export?format=cdm` では上記 CDM 専用 include が含まれることを確認する
- **期待結果**: CSV は軽量 include、CDM は workbook に必要な include を使い分ける
- **スクリプト**: `__tests__/app/api/tournaments/[id]/export/route.test.ts`, `__tests__/docs/e2e-cases-drift.test.ts`

## TC-818A: CDM export — timeValueForCDM の冗長 wrapper を削除する
- **URL**: /api/tournaments/[id]/export?format=cdm
- **背景**: issue #818。`timeValueForCDM` は `parseTimeMs` と等価な wrapper で、CDM 時刻書き込みの意図を増やさず間接参照だけを増やしている。
- **手順**:
  1. export route に `timeValueForCDM` 関数が残っていないことを確認する
  2. TT qualification の CDM コース時刻書き込みが `parseTimeMs(times[course])` を直接使うことを確認する
- **期待結果**: CDM export の時刻変換は単一 helper `parseTimeMs` に集約される
- **スクリプト**: `__tests__/docs/e2e-cases-drift.test.ts`

## TC-819A: CDM export — テンプレート座標の固定値に根拠コメントを付ける
- **URL**: /api/tournaments/[id]/export?format=cdm
- **背景**: issue #819。CDM 2025 テンプレートの行数・列ブロックは workbook 側の固定座標であり、コメントなしの数値にすると通常の大会上限と誤読されやすい。
- **手順**:
  1. export route に CDM 2025 workbook template coordinates のコメントがあることを確認する
  2. Main Hub、qualification、finals block、`CDM_TT_ROUND_START_COLUMNS`、overall ranking の固定範囲が名前付き定数で表現されることを確認する
  3. 書き込み処理がそれらの定数を使うことを確認する
- **期待結果**: CDM テンプレート由来の固定値は、どの workbook 範囲を守るための値か読める
- **スクリプト**: `__tests__/docs/e2e-cases-drift.test.ts`

## TC-1871A: CDM export — TT Qualifications の範囲定数を専用名にする
- **URL**: /api/tournaments/[id]/export?format=cdm
- **背景**: issue #1871。TT Qualifications は Main Hub と同じ行レイアウトだが、`CDM_PLAYER_HUB_*` を直接使うと別シートの範囲が Main Hub に依存しているように読める。
- **手順**:
  1. `CDM_TT_QUAL_FIRST_ROW` / `CDM_TT_QUAL_MAX_PLAYERS` が存在することを確認する
  2. `writeTTQualifications` が TT 専用定数を使って clear と slice を行うことを確認する
  3. TT 専用定数が Main Hub と同じレイアウトである理由コメントを持つことを確認する
- **期待結果**: TT Qualifications の固定範囲は、Main Hub の実装詳細ではなく TT シートの範囲として読める
- **スクリプト**: `__tests__/docs/e2e-cases-drift.test.ts`

## TC-1872A: CDM export — finals/TT round の残存座標を名前付き定数にする
- **URL**: /api/tournaments/[id]/export?format=cdm
- **背景**: issue #1872。`writeMatchFinalsSheet` / `writeTTFinals` の clearRange に残った `107`, `5`, `524`, `1`, `26` は CDM 2025 テンプレート由来の固定座標であり、数値直書きのままだと根拠が追いにくい。
- **手順**:
  1. finals block の幅、最終列、match 開始行が `CDM_FINALS_*` 定数で表現されることを確認する
  2. TT round block の幅、最終列、開始/終了行が `CDM_TT_ROUND_*` 定数で表現されることを確認する
  3. `clearRange` がこれらの定数を使い、数値直書きを残していないことを確認する
- **期待結果**: finals/TT round のテンプレート座標はすべて名前付き定数経由で参照される
- **スクリプト**: `__tests__/docs/e2e-cases-drift.test.ts`

## TC-1874A: CDM export — clearRange の inclusive end を offset 命名で表現する
- **URL**: /api/tournaments/[id]/export?format=cdm
- **背景**: issue #1874。`clearRange` の end column は inclusive なので、`start + 6` / `start + 5` を幅として命名すると実際のクリア列数とずれて読める。
- **手順**:
  1. `clearRange` が end column / row を inclusive に扱うことをコメントで確認する
  2. finals block と TT round block の派生 end column が `*_BLOCK_END_OFFSET` 定数で表現されることを確認する
  3. `CDM_FINALS_BLOCK_WIDTH` / `CDM_TT_ROUND_BLOCK_WIDTH` が残っていないことを確認する
- **期待結果**: CDM テンプレートのブロック終端は「幅」ではなく inclusive end offset として読める
- **スクリプト**: `__tests__/docs/e2e-cases-drift.test.ts`

## TC-348: キャラクター統計 API — admin のみアクセス可 (TC-328 と重複なし: 形式チェック)
- **URL**: /api/players/[id]/character-stats
- **authRequired**: true (admin) / false → 401
- **背景**: admin はレスポンスの形状を確認できる; 非認証は 401。
- **手順**:
  1. 管理者で `GET /api/players/:id/character-stats` → 200 + 統計オブジェクト
  2. 非認証で同エンドポイント → 401
- **期待結果**: admin のみ取得可能
- **スクリプト**: tc-all.js TC-348

## TC-349: レスポンシブ — BM/MR/GP 予選ページが 375px 幅で JS エラーなしに表示される
- **authRequired**: true (admin)
- **背景**: スマートフォン幅でも JS エラーなしにレンダリングできること。issue #1028 の回帰として、途中で例外が発生しても TC-349 が登録した `pageerror` / `response` listener を残留させず、後続 TC に 5xx 検知や JS エラー検知を漏らさないことも確認する。issue #1649 の回帰として、cleanup 検証は外側の `else` 構造ではなく TC-349 cleanup 専用マーカーで範囲を特定する。
- **手順**:
  1. ビューポートを 375×812 に設定
  2. /bm, /mr, /gp を順に nav → pageerror がゼロ、body に内容あり
  3. 正常終了・例外終了のどちらでも `page.off('pageerror', onErr)` と `page.off('response', onResponse)` が実行される
  4. ビューポートを元の 1280×720 に戻す
- **期待結果**: 3ページとも JS エラーなし、コンテンツあり。TC-349 専用 listener は失敗時にも解除され、ビューポートも復元される
- **スクリプト**: tc-all.js TC-349

## TC-350: BM 決勝 — QF 完了後のルーザーズ R1 UI が実名/TBD を正しく表示する (issue #673)
- **URL**: /tournaments/[id]/bm/finals
- **authRequired**: true (admin)
- **背景**: TC-346 は API インバリアント確認。本 TC は UI が実プレイヤー名 + TBD プレースホルダーを正しくレンダリングすることを確認する。
- **手順**:
  1. 8名ブラケット生成・/bm/finals に移動し M8/M9 が "TBD" x2 であることを確認
  2. M1 に有効スコアを PUT → ルーザーが losers_r1 にルーティング
  3. /bm/finals を再読込 → losers_r1 カードに実ニックネームと TBD が表示されること
- **期待結果**: 片スロットが実名、もう片方が TBD
- **スクリプト**: tc-all.js TC-350

## TC-351: モード別予選確定 — BM 確定が MR/GP スコアをロックしないこと (issue #696)
- **authRequired**: true (admin)
- **背景**: issue #696「一つのモードで予選を確定させると他のモードの予選も確定されてしまう」のリグレッションテスト。BM/MR/GP はそれぞれ独立した `bmQualificationConfirmed`/`mrQualificationConfirmed`/`gpQualificationConfirmed` フラグを持つ。
- **手順**:
  1. 新規トーナメントを作成し BM・MR 予選をセットアップ
  2. `PUT /api/tournaments/{id}` に `{ bmQualificationConfirmed: true }` を送信
  3. BM GET レスポンスの `qualificationConfirmed` が `true` であることを確認
  4. MR マッチにスコアを PUT → 200 が返ること（MR はロックされていない）
- **期待結果**: BM のみロック、MR は編集可能
- **スクリプト**: tc-all.js TC-351

## TC-352: Tournament PUT — debugMode フラグを後から有効化できる
- **URL**: /api/tournaments/[temp-id]
- **authRequired**: true (admin)
- **背景**: debug tournament は preview E2E のセットアップや debug-fill 検証で使うため、作成後の Tournament PUT でも `debugMode` が永続化される必要がある。
- **手順**:
  1. `debugMode=false` の一時トーナメントを作成する
  2. `PUT /api/tournaments/:id` に `{ debugMode: true }` を送信する
  3. PUT レスポンスの `debugMode` が `true` であることを確認する
  4. `GET /api/tournaments/:id?fields=summary` で再取得する
  5. 再取得した summary の `debugMode` が `true` で永続化されていることを確認する
  6. 一時トーナメントを削除する
- **期待結果**: Tournament PUT で `debugMode=true` が保存され、GET summary でも同じ値が返る
- **スクリプト**: tc-all.js TC-352

## TC-353: BM/MR 予選セットアップ — 8人グループで createMany が D1 パラメータ制限内に収まること (issue #736)
- **authRequired**: true (admin)
- **背景**: D1 は SQL ステートメントあたり ~100 バインドパラメータ制限がある。8人グループのラウンドロビンは 28 試合を生成し、各試合に 9～12 カラムあると 252+ パラメータになる。`createMany` をチャンク分割（MATCH_CHUNK=8）することで制限を超えないようにし、D1 ネットワークリトライによる 6 秒外れ値を抑制する。
- **手順**:
  1. 新規トーナメントを作成
  2. BM 予選 POST: 8人全員を同一グループ A にセット
  3. POST が 201 を返すことを確認（タイムアウトなし）
  4. GET でマッチ数が 28（8×7/2）であることを確認
  5. MR 予選も同様に 8人グループで POST → 201 確認 + マッチ数 28 確認
- **期待結果**: POST が 201 を返し、マッチ数が 28 (BM) / 28 (MR) であること。タイムアウトや 500 エラーが発生しないこと
- **スクリプト**: tc-all.js TC-353

## TC-354: Broadcast API — GET/PUT の形状・永続化・バリデーション確認
- **authRequired**: false (GET), true/admin (PUT)
- **背景**: `/api/tournaments/[id]/broadcast` は OBS オーバーレイ表示用の 1P/2P 名・マッチラベル・勝利数・FT・座標 layout を管理する。GET は公開・PUT は管理者のみ。
- **手順**:
  1. 新規トーナメントを作成
  2. GET → `{ player1Name, player2Name, matchLabel, player1Wins, player2Wins, matchFt, layout }` の形状が返ること（初期値は空文字/null/default 座標）
  3. 管理者として PUT `{ player1Name: '1P-Alice', player2Name: '2P-Bob', matchLabel: 'QF1', player1Wins: 2, player2Wins: 1, matchFt: 5, layout: { ...座標 } }` → 200。レスポンス body は API 向け `matchLabel/player1Wins/player2Wins/matchFt` のみを返し、DB カラム名 `overlayMatchLabel/overlayPlayer1Wins/overlayPlayer2Wins/overlayMatchFt` を含まないこと
  4. GET → PUT した値が永続化されていること
  5. PUT `{ matchLabel: null }` → フィールドがクリアされ、レスポンス body に `overlayMatchLabel/overlayMatchFt` を含まないこと（200）
  6. PUT `{ player1Wins: null, player2Wins: null }` → レスポンス body と再取得 GET の両方で 1P/2P 勝利数が null にクリアされ、レスポンス body に `overlayMatchLabel/overlayPlayer1Wins/overlayPlayer2Wins/overlayMatchFt` が含まれないこと（200）
  7. 小数・負数の `player1Wins/player2Wins/matchFt` は 400 で拒否されること
  8. 配信管理ページで複数の点数欄に小数・負数を入力して「配信に反映」を押すと、送信前に対象欄を列挙した 0 以上の整数エラーと赤枠表示が出ること
  9. OBS 1920×1080 キャンバス外の `layout` 座標は 400 で拒否されること
- **期待結果**: GET は正しい形状を返し、PUT は値を永続化・クリアできる
- **スクリプト**: tc-all.js TC-354

## TC-355: Suspenseストリーミング モードページ — RSCストリーミングで骨格が先行表示され動的コンテンツが描画される (issue #694)
- **authRequired**: false
- **背景**: BM/MR/GP/TA の各予選ページを Suspense ラッパー構造に変更した。
  `cacheComponents` (PPR) はルートレイアウトが `getLocale()`/`headers()` を Suspense 外で使用するため全体適用できないが、
  RSC ストリーミングによりローディングスケルトンをデータフェッチ前に先行送信できる。
- **手順**:
  1. 既存トーナメントの BM/MR/GP/TA 各予選ページに `https` モジュールで GET リクエストを送信（ブラウザ外）
  2. HTTP 200 が返ること（ステータスコード確認）
  3. Playwright で各モードページを開き、8秒待機後にコンテンツが表示されること
  4. 各ページで「Failed to fetch」が表示されず、HTTP 5xx レスポンスや JS エラーが発生しないこと
  5. ページにテーブルまたは見出しテキストが存在し、スケルトンだけではないことを確認
- **期待結果**:
  - 4モードページすべて HTTP 200
  - ページコンテンツ（テーブルまたは見出し）が visible
  - エラーメッセージなし
- **スクリプト**: tc-all.js TC-355

## TC-356: GP 決勝 — cup-win スコア入力がモバイル幅に収まる
- **authRequired**: true (admin)
- **背景**: GP 決勝は cup-win score-only 入力に移行済み。モバイル幅でもP1/P2の数値入力がダイアログ内に収まり、横スクロールなしで操作できる必要がある。
- **手順**:
  1. 8名 GP 予選を作成し、全予選スコアを入力して決勝ブラケットを生成
  2. GP 決勝ページ `/tournaments/[id]/gp/finals` を開く
  3. 最初の決勝マッチをクリックしてスコア入力ダイアログを開く
  4. `#gp-finals-simple-score1` / `#gp-finals-simple-score2` がダイアログ幅内に収まることを確認
- **期待結果**:
  - P1/P2 の cup-win 入力がモバイル幅で表示される
  - どちらの入力もダイアログ外にはみ出さない
- **スクリプト**: tc-all.js TC-356

## TC-357: Suspense fallback — 4モード予選ページの見出しが即時描画される
- **authRequired**: true (admin)
- **背景**: RSC streaming / PPR の待機中、および RSC fallback 解決後に client polling data が hydrate されるまでの間も E2E セレクタと利用者の初期表示が安定するよう、BM/MR/GP/TA の qualification fallback/client loading state はモード名見出しを先に描画する必要がある。
- **手順**:
  1. 共有トーナメント ID を使って BM/MR/GP/TA の各予選ページへ順に遷移し、`domcontentloaded` 直後に確認する
  2. 各ページで `h1` を即時確認する
  3. BM は `バトルモード` または `Battle Mode`、MR は `マッチレース` または `Match Race`、GP は `グランプリ` または `Grand Prix`、TA は `タイムアタック` / `Time Attack` / `Time Trial` のいずれかを含む見出しがあることを確認する
- **期待結果**: 4モードすべてで fallback/client loading 期間中もモード名見出しが存在し、遅いデータ取得でも見出しセレクタが安定する
- **スクリプト**: tc-all.js TC-357

## TC-401: 全モードトーナメント — TA/BM/MR/GP の予選データが正しく存在する
- **authRequired**: true (admin)
- **背景**: `setupAllModes28PlayerQualification` で28名 × 4モードの予選を完了させた後、各モード API が有効なデータを返すことを確認する統合テスト。
- **手順**:
  1. 28名プレイヤーを作成し TA/BM/MR/GP それぞれの予選を完了
  2. 各モードの GET API → エントリ/マッチが存在することを確認
- **期待結果**: 4モードすべてで予選データが正常に返る
- **スクリプト**: tc-all.js TC-401

## TC-402: 総合ランキング計算・表示 — 全モード予選完了後の集計確認
- **URL**: /api/tournaments/[id]/overall-ranking
- **authRequired**: true (admin)
- **背景**: TC-401 の共有トーナメントで総合ランキングを計算し、全モードの集計が含まれ、順位が正しく返ることを確認する。
- **手順**:
  1. TC-401 完了後、POST /overall-ranking (recalculate) → 200
  2. GET /overall-ranking → mode フィールドに ta/bm/mr/gp が含まれること、rank/total が number であること
  3. /overall-ranking ページを表示 → コンテンツが表示されること
- **期待結果**: 4モード対応の総合ランキングが返り、ページも正常に表示される
- **スクリプト**: tc-all.js TC-402

## TC-1090-1091: 総合ランキング — match model 網羅性と TA 空エントリ検証
- **URL**: /api/tournaments/[id]/overall-ranking
- **authRequired**: true (admin)
- **背景**: issue #1090/#1091。BM/MR/GP の real qualification match 検出は `gPMatch` を暗黙 default にせず、`Record<MatchQualificationModel, ...>` で網羅する。TA は TTEntry ベースで BREAK match を生成しないため、BREAK-like な `times=null` / `{}` entry が総合ランキングへ加点されないことを確認する。
- **手順**:
  1. `hasCompletedRealQualificationMatch` が `bMMatch` / `mRMatch` / `gPMatch` を exhaustive map で選択することを static guard で確認する
  2. TA qualification の `times=null` / `{}` entry を overall ranking の TA qualification 集計へ渡す
  3. 空 entry が 0 点として playerId に map され、BM/MR/GP の BREAK-only ガードとは別経路で扱われることを確認する
- **期待結果**: 新しい match model 追加時は TypeScript の `Record<MatchQualificationModel, ...>` が未対応を検出し、TA の空エントリは総合ランキングに正のポイントを発生させない
- **スクリプト**: n/a (static/unit coverage) — `smkc-score-app/__tests__/static/tc-1090-1091-overall-ranking.test.ts`, `smkc-score-app/__tests__/lib/points/overall-ranking.test.ts`

## TC-1451-1452: E2E case helper — static guard の重複と脆さを抑える
- **URL**: n/a
- **authRequired**: false
- **背景**: issue #1451/#1452。TC-1090-1091 追加時に static test と drift test が E2E case section parser を重複定義し、さらに overall-ranking 実装の具体的な finder 文字列に依存していた。
- **手順**:
  1. `__tests__/helpers/e2e-cases.ts` の共通 helper から E2E case section を取得する
  2. `tc-1090-1091-overall-ranking.test.ts` と `e2e-cases-drift.test.ts` が同じ helper を使うことを確認する
  3. static guard は `Record<MatchQualificationModel, ...>` と暗黙 default の不在を確認し、個別 finder の実装文字列には依存しない
- **期待結果**: E2E case parsing の仕様が1か所に集約され、formatter や finder 分割のような安全な実装変更で static guard が不要に失敗しない
- **スクリプト**: n/a (static/doc coverage) — `smkc-score-app/__tests__/helpers/e2e-cases.ts`, `smkc-score-app/__tests__/static/tc-1090-1091-overall-ranking.test.ts`, `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`

## TC-1454-1455: E2E case helper — キャッシュと明確な section error
- **URL**: n/a
- **authRequired**: false
- **背景**: issue #1454/#1455。共通化した E2E case helper が `E2E_TEST_CASES.md` を呼び出しごとに読み込み、`sectionBetween` 内で直接 `expect()` していたため、不要な IO と読みにくい失敗位置が残っていた。
- **手順**:
  1. `e2eCaseSection` が module-level cache された E2E cases をデフォルト source として使うことを確認する
  2. `sectionBetween` が helper 内で `expect()` を呼ばず、marker 名入りの例外を返すことを確認する
  3. 既存の drift/static tests が同じ helper 経由で通ることを確認する
- **期待結果**: E2E case section 取得は不要なファイル再読み込みを避け、section 抽出失敗時は marker 名のあるエラーで原因を特定できる
- **スクリプト**: n/a (static/doc coverage) — `smkc-score-app/__tests__/helpers/e2e-cases.ts`, `smkc-score-app/__tests__/static/tc-1417-home-recommendation.test.ts`, `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`

## TC-1457: E2E case helper — readRepoFile 定義後に cache 初期化する
- **URL**: n/a
- **authRequired**: false
- **背景**: issue #1457。`readRepoFile` は関数宣言として hoist されるが、module cache 初期化より後に定義されていると、上から読んだときに未定義関数を呼んでいるように見える。
- **手順**:
  1. `__tests__/helpers/e2e-cases.ts` で `readRepoFile` 定義が `const e2eCases = readRepoFile(...)` より前にあることを確認する
  2. 既存の E2E case drift/static tests が helper 経由で通ることを確認する
- **期待結果**: helper の module-level cache は読みやすい宣言順で初期化され、既存の E2E case section 取得挙動は変わらない
- **スクリプト**: n/a (static/doc coverage) — `smkc-score-app/__tests__/helpers/e2e-cases.ts`, `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`

## TC-2006-2007: BM/MR match lean select — shallow boolean payload contract
- **URL**: n/a
- **authRequired**: false
- **背景**: issue #2006/#2007。`BM_MR_MATCH_LEAN_SELECT` は BM/MR 予選 match payload の共有 select 契約であり、必須 field set は `satisfies` 型契約で守り、unit test では Prisma select として shallow な `true` 値だけを持つことを確認する。
- **手順**:
  1. `prisma-selects.test.ts` が `Object.entries(BM_MR_MATCH_LEAN_SELECT)` から selected entries を検証することを確認する
  2. selected entries が空でなく、各 entry が空でない key と `true` 値だけを持つことを確認する
  3. drift test が本 TC と unit coverage の対応を検証する
- **期待結果**: BM/MR 共有 match payload は shallow な boolean select として維持され、必須 field set の増減は `satisfies` 型契約で検出する
- **スクリプト**: n/a (unit/static coverage) — `smkc-score-app/__tests__/lib/prisma-selects.test.ts`, `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`

## TC-320: BM/MR/GP マッチリスト行レベルのスコア入力リンク非表示化 ✅ FIXED (PR #407)
- **URL**: /tournaments/[temp-id]/bm, /mr, /gp → Matches タブ
- **authRequired**: true (admin)
- **背景**: TC-820/821 対応でスコア入力は participant ページに統合された。マッチリスト行に「スコア入力」リンクが表示されていたのは旧UI
- **手順**:
  1. `/bm` → Matches タブ → 「Details」/「詳細」リンクがあること（スコア入力リンクではない）
  2. `/mr` → Matches タブ → 行レベルの「スコア入力」リンクが**ない**こと
  3. `/gp` → Matches タブ → 行レベルの「Score Entry」リンクが**ない**こと
- **期待結果**: BM は "Details"、MR/GP は行レベルにスコア入力リンクなし

## TC-321: BM match/[matchId] ページが view-only であることを確認 ✅ FIXED (PR #407)
- **URL**: /tournaments/[temp-id]/bm/match/[matchId]
- **authRequired**: true (admin)
- **背景**: TC-820/821 対応で BM match ページは参加者専用 rather than admin score entry
- **手順**:
  1. テスト用トーナメント + プレイヤー2名を作成、BM グループ設定
  2. `/bm/match/[matchId]` 页面訪問
  3. プレイヤー名とマッチ情報（view-only）が表示されていること
  4. スコア入力フォーム要素（"I am"/"私は" アイデンティティ選択、+/- ボタン）が**ない**こと
  5. 未完了マッチは進行中メッセージが表示されること
  6. クリーンアップ
- **期待結果**: BM match ページは admin に対して view-only（スコア入力は /bm/participant を使用）

## TC-513: BM match ページのセッション別ガイダンス
- **URL**: /tournaments/[temp-id]/bm/match/[matchId]
- **authRequired**: varies
- **背景**: commit 05b0625 — admin が共有マッチページを開いた時に CTA が表示されていなかった問題を修正。admin 専用のガイダンス分岐を追加
- **手順**:
  1. 未認証ユーザーでマッチページを開く → "Sign in to report scores" プロンプトが表示されることを確認
  2. 管理者セッションでマッチページを開く → "Admins can view this shared page..." ガイダンスと「スコア入力ページを開く」ボタンが表示されることを確認
  3. プレイヤーセッションでマッチページを開く → "Score entry is on the participant page" ガイダンスと「Go to Score Entry」ボタンが表示されることを確認
  4. クリーンアップ
- **期待結果**: 未認証/管理者/プレイヤーそれぞれに適切なガイダンスが表示される

## TC-512: BM TV番号割り当て検証 (tvNumber 1〜4 のみ許可)
- **URL**: /api/tournaments/[id]/bm (PATCH)
- **authRequired**: true (admin)
- **背景**: issue #529 — tvNumber は 1〜4 のみ有効。5 以上は 422 で拒否される
- **手順**:
  1. テスト用トーナメントで BM を設定し、non-BYE マッチを取得
  2. `PATCH /api/tournaments/[id]/bm` で `tvNumber: 4` を送信 → 200 が返ること
  3. 同マッチに `tvNumber: 5` を送信 → 422 が返ること
  4. `tvNumber: null` を送信 → 200 が返り TV 割り当てがクリアされること
- **期待結果**: tvNumber 1〜4 は受け入れられ、5 以上は拒否される

## TC-511: BM スラッグ無し URL からマッチ詳細ページが正常に表示される（ID 経路の回帰）
- **URL**: /tournaments/[id]/bm/match/[matchId]
- **authRequired**: true (admin)
- **背景**: 共有フィクスチャ `normalTournament`（`E2E Shared Normal`）はスラッグを `e2e` に固定しているため、Phase A の本流ワークフローは常にスラッグ経路（`/tournaments/e2e/...`）を経由する。本テストはその対称ケースとして、**スラッグを持たないトーナメント**でも tournament-id 経路でマッチ詳細ページが正常にレンダリングされることを保証する回帰テスト
- **手順**:
  1. 管理者セッションでスラッグ**無し**の一時トーナメント（`E2E BM NoSlug TIMESTAMP`）とプレイヤー2名を作成、BM グループ設定を行う
  2. BM マッチ一覧 API で non-BYE マッチを取得する
  3. `/tournaments/[id]/bm` → Matches タブ → `a[href="/tournaments/[id]/bm/match/[matchId]"]` リンクをクリックする
  4. URL が `/tournaments/[id]/bm/match/[matchId]` に遷移することを確認する
  5. ページ内に player1.nickname と player2.nickname が表示されていること、かつ「試合が見つかりません / Match not found」が表示されていないことを確認する
  6. クリーンアップ
- **期待結果**: スラッグ未設定の tournament-id URL でマッチ詳細ページが正常にレンダリングされる（ID 直接ルックアップが機能する）

> **共有フィクスチャ補足**: `e2e/lib/fixtures.js` の `normalTournament` は slug=`e2e` 固定で再利用される。既存トーナメントが別のスラッグ／slug 未設定で残存していた場合、`ensureSharedTournament` は削除して `slug='e2e'` で作り直す。スラッグ経路のカバレッジは Phase A 全体で得られるため、TC-511 は「スラッグ無しケース」専用の回帰テストとして残す。

## BM フルワークフロー設計方針
- **予選プレイヤー数**: 28名（4グループ × 7名、7はオッドのため各グループに BYE が混在）
- **予選試合数**: 7名RR = 21試合 × 4グループ = **84試合**（API一括投入）
- **決勝**: 上位8名でダブルイリミネーション (17試合)
- **決勝形式**: best-of-9 (first-to-5)、`score1 + score2 ≦ 9` で一方が `5` に到達した時点で勝者確定
- 単発の participant テスト (TC-322/501/502/507/508/509) は 2 名のみで設置（高速フィードバック用）

## TC-501: BMプレイヤーログインからスコア入力・送信まで
- **URL**: /auth/signin -> /tournaments/[temp-id]/bm/participant
- **authRequired**: true (player)
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー2名を作成し、一時パスワードを取得する
  2. 一時トーナメントで BM 予選をグループ設定APIで作成し、2名のpendingマッチを生成する
  3. 別の一時ブラウザコンテキストで対象プレイヤー（player1）としてログインする
  4. `/tournaments/[temp-id]/bm/participant` を開き、pendingマッチが表示されることを確認する
  5. +/-ボタンで score1=3, score2=1 に設定し「Submit Scores」をクリックする
  6. 成功アラートが表示され、pendingマッチが消えることを確認する
  7. 管理者APIで対象マッチがcompletedになり、score1=3, score2=1が保存されていることを確認する
  8. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: BMのparticipant入力フォームから実際にスコア送信でき、結果が永続化される

## TC-502: BMプレイヤー引き分け(2-2)スコアの送信
- **URL**: /tournaments/[temp-id]/bm/participant
- **authRequired**: true (player)
- **背景**: §4.1により2-2引き分けは有効（draw = 1ポイント）
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー2名を作成する
  2. BMグループ設定を行い、pendingマッチを生成する
  3. 一時ブラウザで対象プレイヤーとしてログインし、`/bm/participant` を開く
  4. +/-ボタンで score1=2, score2=2 に設定する
  5. 「Submit Scores」ボタンが有効であることを確認し、クリックする
  6. 成功アラートが表示されることを確認する
  7. 管理者APIでマッチがcompletedかつscore1=2, score2=2であることを確認する
  8. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: 2-2の引き分けスコアが正常に送信・保存される

## TC-503: BM予選28名フル + 決勝ブラケット生成・1試合スコア入力
- **URL**: /tournaments/[temp-id]/bm/finals
- **authRequired**: true (admin)
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー **28名** を作成する
  2. BMグループ設定を 4グループ × 7名 (snake-draft) に登録（奇数なのでBYE発生）
  3. 全予選マッチ（21試合 × 4 = 84試合）のスコアを API で 3-1 入力し completed にする
  4. `POST /api/tournaments/[id]/bm/finals` `{ topN: 8 }` でブラケット生成（17試合）
  5. M1 に 3-0 で PUT → 400 拒否（best-of-9 なので first-to-5 必須）
  6. M1 に 5-0 で PUT → 200 受理、勝者→M5、敗者→M8 にルーティングされること
  7. クリーンアップ（トーナメント `status='draft'` に降格 → DELETE → プレイヤー DELETE）
- **期待結果**: 28名予選→上位8名抽出→決勝ブラケットの全フローが正常動作

## TC-504: BM決勝ブラケットリセット（28名予選後）
- **URL**: /tournaments/[temp-id]/bm/finals
- **authRequired**: true (admin)
- **手順**:
  1. TC-503同様に 28名予選 + 決勝ブラケット生成
  2. M1 に 5-0 で PUT
  3. ブラケット生成 API を再 POST（=「Reset Bracket」UI 動作と同等）
  4. 全 17 マッチが `completed=false` の pending 状態に戻ること
  5. クリーンアップ
- **期待結果**: ブラケットリセットで全マッチが未完了状態に戻る

## TC-510: BM Top-24 バラージ（Pre-Bracket Playoff）→ Top-16 決勝ブラケット
- **URL**: /tournaments/[temp-id]/bm/finals
- **authRequired**: true (admin)
- **背景**: issue #454 / PR #477 で `topN: 24` の BM 決勝生成が二段階化された。2グループ時はA/Bを合算せず、手書き紙の2グループ用配置に従って Top16 direct 枠とバラージ枠を決める
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー **28名** を作成する
  2. BMグループ設定を 2グループ × 14名に登録し、全予選マッチを completed にする
  3. `POST /api/tournaments/[id]/bm/finals` `{ topN: 24 }` を実行し、`phase='playoff'` と 8件の `stage='playoff'` マッチ（`playoff_r1` 4件、`playoff_r2` 4件）が作成されることを確認
  4. `playoffSeededPlayers` と playoff match が紙配置（`A9 vs B12 -> B8`, `B10 vs A11 -> A7`, `B9 vs A12 -> A8`, `A10 vs B11 -> B7`）と一致することを確認
  5. バラージ未完了のまま再度 `{ topN: 24 }` を POST → 409 `PLAYOFF_INCOMPLETE` になることを確認
  6. `playoff_r1` M1〜M4 を 5-0 で入力し、各勝者が対応する `playoff_r2` M5〜M8 の `player2` にルーティングされることを確認
  7. `playoff_r2` M5〜M8 を 5-0 で入力し、最後の PUT レスポンスで `playoffComplete=true` になることを確認
  8. 再度 `{ topN: 24 }` を POST し、`phase='finals'` と 31件の `stage='finals'` マッチ（16人ダブルエリミネーション）が作成されることを確認
  9. `seededPlayers` が紙配置どおり `A1 vs barrage winner, B4 vs A5, B2 vs barrage winner, A3 vs B6, B1 vs barrage winner, A4 vs B5, A2 vs barrage winner, B3 vs A6` になることを確認
  10. クリーンアップ
- **期待結果**: 2グループのTop24生成は合算順位を使わず、グループ内順位だけで紙配置どおりのバラージとTop16決勝ブラケットを生成する

## TC-517: BM 決勝スコアダイアログが実際の targetWins を表示する
- **URL**: /tournaments/[temp-id]/bm/finals
- **authRequired**: true (admin)
- **背景**: commit c8f77ab — 決勝スコア入力ダイアログの警告が hard-coded "first to 5" だった問題を修正。各マッチの targetWins を動的に表示
- **手順**:
  1. 28名予選完了状態のトーナメントで Top-24 ブラケット生成（playoff_r1 = FT3, playoff_r2 = FT4）
  2. `/bm/finals` を開き、playoff_r1 のマッチカード（M1）をクリックしてダイアログを開く
  3. スコアを 1-1 と入力し、警告メッセージに "FT3" / "3勝先取" が含まれることを確認
  4. ダイアログを閉じ、playoff_r2 のマッチカード（M5）をクリック
  5. スコアを 1-1 と入力し、警告メッセージに "FT4" / "4勝先取" が含まれることを確認
  6. クリーンアップ
- **期待結果**: ダイアログの警告がマッチのラウンドに応じた targetWins を正しく表示する

## TC-519: ブラケット生成直後の losers_r1 が TBD を表示する
- **URL**: /tournaments/[temp-id]/bm/finals
- **authRequired**: true (admin)
- **背景**: commit 9ad4013 / issue #574 — ブラケット生成直後、DB スキーマの非 null 制約により未確定スロットに seed 1 プレイヤーが placeholder として埋められ、losers_r1 に実在プレイヤー名が表示されていた。winners-side の結果が確定するまで TBD と表示すべき
- **手順**:
  1. 28名予選完了状態のトーナメントで Top-8 ブラケット生成
  2. `/bm/finals` を開く
  3. losers_r1 のマッチカード（M8, M9）を確認
  4. 両カードの両プレイヤーが "TBD" と表示されていることを確認
  5. クリーンアップ
- **期待結果**: winners-side の試合が完了する前、losers_r1 はプレイヤー名ではなく TBD を表示する

## TC-515: BM Top-24 Playoff UI フロー
- **URL**: /tournaments/[temp-id]/bm → /bm/finals
- **authRequired**: true (admin)
- **背景**: `topN=24` で BM 決勝生成するとまず 8 試合（playoff_r1 4試合 + playoff_r2 4試合）のバラッジが生成される。UI が以下の流れを正しく提示すること: 予選ページ「Start Playoff」ボタン → Finals ページ Playoff ブラケット表示 → playoff_r2 完了で playoffComplete=true → Phase 2（Upper Bracket）生成
- **手順**:
  1. 28名予選完了状態のトーナメントで qualificationConfirmed=true にする
  2. 既存ブラケットをリセットし、予選ページ（`/bm`）に「Start Playoff (バラッジ開始)」ボタンが表示されることを確認する
  3. API で `POST /bm/finals { topN: 24 }` を実行し playoff ブラケットを生成する
  4. `/bm/finals` に遷移し「Playoff (Barrage)」ラベルと M1 が表示されることを確認する
  5. playoff_r1 M1〜M4 を 3-0、playoff_r2 M5〜M8 を 4-0 で API 入力する
  6. 最後の PUT レスポンスで `playoffComplete=true` になることを確認する
  7. 再度 `POST /bm/finals { topN: 24 }` で Phase 2（Upper Bracket）を生成し、`phase='finals'` が返ることを確認する
  8. `/bm/finals` に戻り「Upper Bracket / アッパーブラケット」が表示されることを確認する
  9. クリーンアップ
- **期待結果**: BM Top-24 バラッジの UI フローが全段階で正常動作する

## TC-1048: BM/MR/GP Top-24 Phase 2 アクションカード共通化
- **URL**: /tournaments/[temp-id]/bm/finals, /mr/finals, /gp/finals
- **authRequired**: true (admin)
- **背景**: issue #1048。バラージ完了後に表示する「上位ブラケット作成」カードは BM/MR/GP で同じ Phase 2 遷移アクションなので、表示・文言・クリック処理を共通コンポーネントから提供する。
- **手順**:
  1. TC-515 / TC-615 / TC-715 と同じ Top-24 バラージを作成する
  2. 各モードで playoff_r1 と playoff_r2 を全て完了し、`playoffComplete=true` にする
  3. Phase 2 API を呼ぶ前に finals ページを開く
  4. 「Create Upper Bracket / 上位ブラケット作成」ボタンが表示されることを確認する
  5. Phase 2 を生成し、Upper Bracket 表示へ遷移できることを確認する
- **期待結果**: BM/MR/GP の Top-24 バラージ完了状態で同じ Phase 2 アクションが表示され、共通コンポーネントの unit test と既存 Top-24 E2E フローで退行を検出できる
- **スクリプト**: tc-bm.js TC-515 + tc-mr.js TC-615 + tc-gp.js TC-715 + `smkc-score-app/__tests__/components/tournament/playoff-complete-card.test.tsx`

## TC-1046: BM Top-24 preview は 24名要件を専用定数で判定する
- **URL**: /api/tournaments/[id]/bm/finals (GET)
- **authRequired**: true (admin)
- **背景**: issue #1046。Top-24 Phase 2 preview の資格者数 guard が裸の `24` だと、12名のバラージ参加者数 (`PLAYOFF_ENTRANT_COUNT`) と誤って同一視されやすい。Top-24 全体の必要資格者数とバラージ参加者数は別概念として固定する。
- **手順**:
  1. 管理者セッションで BM Top-24 の playoff stage が存在する状態を用意する
  2. 資格者数が24名未満の状態で finals GET preview を呼ぶ
  3. preview 用の `seededPlayers` / Top-16 `bracketStructure` が作られず、既存 playoff 情報だけが返ることを確認する
  4. 静的テストで `TOP24_QUALIFIER_COUNT` が `PLAYOFF_ENTRANT_COUNT` と別に定義され、`buildTop24FinalsPreview` と POST guard の両方で使われることを確認する
- **期待結果**: Top-24 preview は「24名必要」という仕様を専用定数で表し、12名のバラージ参加者数に誤置換されない
- **スクリプト**: tc-bm.js TC-1046 + `smkc-score-app/__tests__/static/tc-1046-top24-qualifier-count.test.ts` + `smkc-score-app/__tests__/lib/api-factories/finals-route.test.ts`

## TC-1622: BM Top-24 preview 前の23名再セットアップは資格者を置換する
- **URL**: /api/tournaments/[id]/bm, /api/tournaments/[id]/bm/finals (GET)
- **authRequired**: true (admin)
- **背景**: issue #1622。TC-1046 は 28名で Top-24 playoff を作った後、同じ大会を23名で再セットアップして preview guard を確認する。`setupBmQualViaUi` が既存資格者を差し替えず追記した場合、DBに28名残ってテスト前提が崩れるため、再セットアップ後の資格者数を明示的に検証する。
- **手順**:
  1. 管理者セッションで 28名 BM 予選を完了し、Top-24 playoff を生成する
  2. 同じ大会に対して `setupBmQualViaUi(..., players.slice(0, 23))` を再実行する
  3. BM qualification API の資格者数が23名に置換されていることを確認する
  4. その状態で finals GET preview を呼び、TC-1046 と同じく Top-16 preview が作られないことを確認する
- **期待結果**: TC-1046 の「24名未満」前提は UI セットアップの置換動作で保証され、古い28名 qualification が残って偽陽性にならない
- **スクリプト**: tc-bm.js TC-1046 + `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts` + `smkc-score-app/__tests__/lib/api-factories/finals-route.test.ts`

## TC-1612: Top-24 Phase 2 アクションカードの追加 className マージ
- **URL**: /tournaments/[temp-id]/bm/finals, /mr/finals, /gp/finals
- **authRequired**: true (admin)
- **背景**: issue #1612。Top-24 バラージ完了後の共通アクションカードは、呼び出し側が `mt-4` などの配置用 className だけを渡しても完了状態を示す緑の枠線・背景を失ってはいけない。
- **手順**:
  1. TC-1048 と同じ Top-24 バラージ完了状態を作る
  2. finals ページで Phase 2 アクションカードが表示されることを確認する
  3. 共通コンポーネントに追加 className だけを渡すケースでも、カードが `border-green-500/50` と `bg-green-500/10` を保持することを確認する
  4. 空文字の className を渡す退行ケースでも同じデフォルトスタイルが残ることを確認する
- **期待結果**: 呼び出し側が配置・余白だけを追加しても、Top-24 完了カードの意味を示すデフォルトスタイルが保持される
- **スクリプト**: `smkc-score-app/__tests__/components/tournament/playoff-complete-card.test.tsx` + `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`

## TC-1614: TC-1612 drift テストの実装詳細固定を避ける
- **URL**: N/A (static coverage)
- **authRequired**: false
- **背景**: issue #1614。TC-1612 の drift テストは E2E シナリオと振る舞いテストの関連を守るためのもので、`PlayoffCompleteCard` の import 文・`cn()` 呼び出し構文・クラス文字列の並びを固定してはいけない。
- **手順**:
  1. `E2E_TEST_CASES.md` に TC-1612 の背景・期待結果・対応スクリプトが記載されていることを確認する
  2. `playoff-complete-card.test.tsx` に追加 className と空文字 className の振る舞いテストがあることを確認する
  3. `e2e-cases-drift.test.ts` の TC-1612 drift テストが、コンポーネントソースファイルの文字列詳細を検査していないことを確認する
- **期待結果**: TC-1612 の E2E ドキュメント連携は維持しつつ、振る舞いを変えない JSX 整形・import 整理・クラス順変更で drift テストが壊れない
- **スクリプト**: `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`

## TC-1616: TC-1614 drift テストの抽出空振りを防ぐ
- **URL**: N/A (static coverage)
- **authRequired**: false
- **背景**: issue #1616。TC-1614 の drift テストは `sectionBetween()` で TC-1612 テスト本文を抽出して禁止文字列がないことを確認するため、境界文字列の変更で抽出に失敗しても `not.toContain()` だけが空文字列に対して通ってはいけない。
- **手順**:
  1. TC-1614 drift テストが `sectionBetween()` で TC-1612 テスト本文を抽出していることを確認する
  2. 抽出結果に対して、十分な長さや既知の正規アンカーを含むことを確認する陽性アサーションがあることを確認する
  3. その後に禁止文字列の `not.toContain()` を実行していることを確認する
- **期待結果**: TC-1612 テスト本文の抽出に失敗した場合、禁止文字列チェックが空振りで成功せず、drift テスト自体が失敗する
- **スクリプト**: `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`

## TC-1618: drift guard の境界文字列をインデント非依存にする
- **URL**: N/A (static coverage)
- **authRequired**: false
- **背景**: issue #1618。`sectionBetween()` の終了境界に `"  it(...` のような先頭スペースを含めると、フォーマット変更だけで抽出に失敗する。
- **手順**:
  1. TC-1614 / TC-1616 の drift guard が `sectionBetween()` を使っていることを確認する
  2. 終了境界文字列が先頭スペースに依存していないことを確認する
  3. 抽出成功を確認する陽性アサーションが維持されていることを確認する
- **期待結果**: インデント変更だけでは drift guard の抽出境界が壊れない
- **スクリプト**: `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`

## TC-1619: drift guard の抽出長しきい値に根拠コメントを付ける
- **URL**: N/A (static coverage)
- **authRequired**: false
- **背景**: issue #1619。TC-1614 guard の `length` しきい値は、なぜその値で空抽出や短すぎる抽出を検出できるのかをコード上で説明する必要がある。
- **手順**:
  1. TC-1614 drift guard に抽出長の陽性アサーションがあることを確認する
  2. しきい値が名前付き定数になっていることを確認する
  3. 現在の抽出本文サイズに対する安全側の閾値であることをコメントで説明していることを確認する
- **期待結果**: 抽出長の閾値がマジックナンバーではなく、将来の調整根拠を読める
- **スクリプト**: `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts`

## TC-516: BM 予選ページの決勝ブラケット存在状態 + リセット
- **URL**: /tournaments/[temp-id]/bm
- **authRequired**: true (admin)
- **背景**: 決勝ブラケット生成後に予選ページを再訪すると「View Tournament / トーナメントを見る」が表示される。危険操作である「Reset Bracket / ブラケットリセット」は予選ロック中は非表示で、直接 API リセットも 409 で拒否され、予選ロック解除後のみ表示される
- **手順**:
  1. 28名予選完了状態のトーナメントで qualificationConfirmed=true にし、Top-8 ブラケットを生成する
  2. 予選ページ（`/bm`）を開き「View Tournament」が表示され、「Reset Bracket」が表示されないことを確認する
  3. ロック中に `POST /api/tournaments/[id]/bm/finals { reset: true }` を直接呼び、409 `QUALIFICATION_LOCKED` が返ることを確認する
  4. qualificationConfirmed=false にして予選ロックを解除し、「Reset Bracket」ボタンが表示されることを確認する
  5. 「Reset Bracket」ボタンをクリックし、確認ダイアログで OK を選択する
  6. リセット後は予選が未ロックのままなので、「Reset Bracket」と「Start Playoff / Generate Finals Bracket」が表示されないことを確認する
  7. クリーンアップ
- **期待結果**: ブラケット生成後は「View Tournament」のみ、予選ロック中の直接 API リセットは拒否され、予選ロック解除後だけ「Reset Bracket」が表示され、リセット後は再ロックまで生成ボタンも出ない

## TC-505: BM Grand Final → チャンピオン決定（28名予選後）
- **URL**: /tournaments/[temp-id]/bm/finals
- **authRequired**: true (admin)
- **手順**:
  1. 28名予選 + 決勝ブラケット生成（TC-503同様）
  2. M1〜M16 を P1 win 5-0 で API 連続入力
     - Winners: QF(1-4), SF(5-6), WF(7)
     - Losers : L_R1(8-9), L_R2(10-11), L_R3(12-13), LSF(14), LF(15)
     - Grand Final: M16 (best-of-9)
  3. M16 で Winners 側勝者 (P1) が 5-0 で勝つ
  4. `/bm/finals` ページの `body.innerText` にチャンピオンの nickname と "Champion/チャンピオン/優勝" のいずれかが含まれること
  5. クリーンアップ
- **期待結果**: 全マッチ完了後にチャンピオンが正しく決定・表示される

## TC-506: BM Grand Final Reset Match（28名予選後）
- **URL**: /tournaments/[temp-id]/bm/finals
- **authRequired**: true (admin)
- **背景**: Grand Final で Losers 側が勝った場合、Reset Match (M17) が発生する
- **手順**:
  1. TC-505 同様に M1〜M15 を P1 win 5-0 で消化
  2. M16 (Grand Final) で Losers 側勝者 (P2) が 0-5 で勝つようにスコア入力
  3. M17 (Grand Final Reset) が出現し両プレイヤーが populate されること
  4. M17 にスコア入力（L-side 勝者を勝たせる）→ completed
  5. クリーンアップ
- **期待結果**: Grand Final Reset が正しくトリガーされ、最終勝者がチャンピオンとなる

## TC-507: BM二重報告 — 双方一致で自動確定
- **URL**: /tournaments/[temp-id]/bm/participant
- **authRequired**: true (player × 2)
- **背景**: dualReportEnabled=true のトーナメントでは両プレイヤーが同じスコアを報告すると自動確定
- **手順**:
  1. 管理者セッションで dualReportEnabled=true のトーナメントとプレイヤー2名を作成
  2. BMグループ設定でpendingマッチを生成
  3. 一時ブラウザでP1としてログインし /bm/participant でスコア3-1を送信
  4. レスポンスに `waitingFor: player2` が含まれることを確認
  5. 管理者APIでマッチが未完了(completed=false)かつ player1ReportedScore1=3 であることを確認
  6. 別の一時ブラウザでP2としてログインし /bm/participant でスコア3-1を送信
  7. レスポンスに `autoConfirmed: true` が含まれることを確認
  8. 管理者APIでマッチが completed=true, score1=3, score2=1 であることを確認
  9. クリーンアップ
- **期待結果**: 双方が同じスコアを報告するとマッチが自動確定される

## TC-508: BM二重報告 — 不一致でmismatch検出
- **URL**: /tournaments/[temp-id]/bm/participant
- **authRequired**: true (player × 2)
- **背景**: 両プレイヤーが異なるスコアを報告した場合、mismatchフラグが立ち管理者レビュー待ちになる
- **手順**:
  1. 管理者セッションで dualReportEnabled=true のトーナメントとプレイヤー2名を作成
  2. BMグループ設定でpendingマッチを生成
  3. P1が3-1でスコア報告
  4. P2が1-3でスコア報告（不一致）
  5. レスポンスに `mismatch: true` が含まれることを確認
  6. 管理者APIでマッチが completed=false のままであることを確認
  7. 管理者がPUTでスコアを確定し、completed=true になることを確認
  8. 管理者PUTレスポンスの `match` は `player1Id/player2Id` を含み、不要な `player1/player2` 展開を含まないことを確認する
  9. クリーンアップ
- **期待結果**: 不一致時はマッチが未完了のままで管理者レビュー待ちになる

## TC-509: BM二重報告 — previousReports表示確認
- **URL**: /tournaments/[temp-id]/bm/participant
- **authRequired**: true (player)
- **手順**:
  1. dualReportEnabled=true のトーナメントでP1が3-1を報告
  2. P2として /bm/participant を開く
  3. 「Previous Reports」セクションにP1の報告(3-1)が表示されることを確認
  4. P2がスコアを報告後、双方の報告が表示されることを確認
  5. クリーンアップ
- **期待結果**: 既存の報告がparticipantページに表示される

## TC-322: BM スコア修正機能（Correct Score UI）
- **URL**: /tournaments/[temp-id]/bm/participant
- **authRequired**: true (player)
- **手順**:
  1. 管理者セッションでテスト用トーナメント + プレイヤー2名を作成し、BMグループ設定
  2. 一時ブラウザで P1 としてログイン → `/bm/participant` を開く
  3. P1 がスコア 3-1 を報告
  4. 「スコアを修正」ボタンが表示されるまで待機 → クリック
  5. UI でスコアを 2-2 に修正し「修正を送信」
  6. 管理者APIでマッチを取得し、スコアが 2-2 で確定していることを確認
  7. クリーンアップ
- **期待結果**: 参加者が提出済みスコアを Correct Score UI から修正できる

## TC-520: BM ラウンド別 targetWins API バリデーション (issue #528)
- **背景**: 決勝ブラケットの各ラウンドは `FT3/FT4/FT5/FT7` の任意設定が可能。有効値は `[3, 4, 5, 7]`、それ以外は 422 を返すこと
- **手順**:
  1. 8名ブラケットを生成する
  2. `PUT /bm/finals { matchId, targetWins: 3 }` → 200
  3. `PUT /bm/finals { matchId, targetWins: 6 }` → 422（無効値）
  4. `PUT /bm/finals { matchId, targetWins: 7 }` → 200
- **期待結果**: 有効値は受け付け、無効値は 422 で拒否される
- **スクリプト**: tc-bm.js TC-520

## TC-521: BM 管理者スコアダイアログ — 長いプレイヤー名が溢れない (issue #619)
- **背景**: プレイヤー名が 50 文字を超える場合でも、スコア入力ダイアログ内のラベルが CSS `truncate` によって収まる必要がある
- **手順**:
  1. 50文字の nickname を持つプレイヤー 2 名を作成
  2. BM グループを設定してスコア入力ダイアログを開く
  3. ダイアログがビューポートを超えていないこと、各ラベルが自分のボックスからはみ出していないことを evaluate で検証
- **期待結果**: ダイアログが開き、長い名前が truncate されて溢れない
- **スクリプト**: tc-bm.js TC-521

## TC-522: BM 決勝 tvNumber の PUT バリデーション (issue #634)
- **背景**: 決勝マッチに TV 番号（1〜4）を割り当てられる。5 以上は拒否、null でクリア
- **手順**:
  1. 8名ブラケットを生成する
  2. `PUT /bm/finals { matchId, tvNumber: 2 }` → 200、永続化確認
  3. `PUT /bm/finals { matchId, tvNumber: 5 }` → 422
  4. `PUT /bm/finals { matchId, tvNumber: null }` → 200（クリア）
- **期待結果**: 有効範囲は受け付け、5 以上は 422 で拒否、null でクリアされる
- **スクリプト**: tc-bm.js TC-522

## TC-523: BM 決勝スコアダイアログ — TV# が選択時に自動保存される (issue #651, autosave)
- **背景**: スコアダイアログ内の TV# ドロップダウンは、選択した瞬間に PATCH で永続化され、toast を表示する。スコアを送信する必要はない。明示的な「TV# 保存」ボタンは削除済み。
- **手順**:
  1. 8名ブラケットを生成し `/bm/finals` に移動
  2. `bracket-match-card` をクリックしてスコアダイアログを開く
  3. TV# ドロップダウンで TV#3 を選択（onChange）
  4. 明示的な「TV# 保存」ボタンが存在しないことを確認
  5. ダイアログが閉じないことを確認（スコア送信は行われていない）
  6. toast (`tvAssigned`) が表示されることを確認
  7. API で matchNumber=1 の tvNumber が 3 に更新されていることを確認
- **期待結果**: 選択即保存。ダイアログを開いたまま TV 番号だけが永続化され、toast が出る
- **スクリプト**: tc-bm.js TC-523

## TC-999: 配信管理マニュアル — TA反映ページのフェーズ別使い分けを明記する
- **URL**: docs/broadcast-admin-manual.md
- **authRequired**: false
- **背景**: issue #999。配信管理者マニュアルの「TAから反映する」は、TAのどのフェーズで `/ta`、`/ta/phase1`、`/ta/phase2`、`/ta/finals` を使うかが曖昧だと当日の配信担当が誤った画面から反映しやすい。
- **手順**:
  1. `docs/broadcast-admin-manual.md` の「6.3 TA から反映する」を読む
  2. TA予選は `/tournaments/[id]/ta` を使うことを確認する
  3. フェーズ1/2は `/tournaments/[id]/ta/phase1` と `/tournaments/[id]/ta/phase2` を使うことを確認する
  4. 決勝は `/tournaments/[id]/ta/finals` を使うことを確認する
  5. 迷う場合は `/tournaments/[id]/ta` から対象フェーズへ移動する案内があることを確認する
- **期待結果**: 配信担当がTAの現在フェーズに応じて正しい反映ページを選べる
- **スクリプト**: n/a (docs/static coverage)

## TC-998: 配信管理マニュアル — TV2/TV3/TV4のオーバーレイ非反映を断定表現にする
- **URL**: docs/broadcast-admin-manual.md
- **authRequired**: false
- **背景**: issue #998。BM/MR/GP などの2P対戦モードでは、OBS の 1P/2P 表示へ反映されるのは TV1 に割り当てた試合だけであり、TV2/TV3/TV4 は別配信台・記録用の扱いになる。マニュアルに「場合がある」と書くと、当日の配信担当が条件次第で出る可能性があると誤解する。
- **手順**:
  1. `docs/broadcast-admin-manual.md` の「5. TV# の使い方」を読む
  2. TV2/TV3/TV4 の用途が2P対戦モードでは「配信表示には反映されない」と断定されていることを確認する
  3. `docs/broadcast-admin-manual.md` の「TV2/TV3/TV4 の選手名が出ない」を読む
  4. TV2/TV3/TV4 に割り当てた2P対戦モードの試合は OBS の 1P/2P 表示へ「出ません」と断定されていることを確認する
  5. `反映されない場合がある` と `出ない場合があります` が残っていないことを確認する
- **期待結果**: 配信担当が TV2/TV3/TV4 を OBS 1P/2P 表示へ出せる可能性があると誤解しない
- **スクリプト**: n/a (docs/static coverage)

## TC-525: BM 決勝スコアダイアログ — 開始コースが選択時に自動保存され、同一ラウンド全試合へ伝播する
- **背景**: スコアダイアログ内の「開始コース」ドロップダウンは、選択した瞬間に PATCH で永続化され、toast を表示する。スコア保存ボタンを押さなくても保存される（TV# と同じUI）。仕様（issue #671 / #728）として「同一ラウンド内の全試合は同じ `startingCourseNumber` を持つ」必要があるため、PATCH は対象マッチだけでなく **同じ stage / 同じ round の全マッチ** に同じ値を反映する。
- **手順**:
  1. 8名ブラケットを生成し `/bm/finals` に移動
  2. `bracket-match-card` をクリックしてスコアダイアログを開く（matchNumber=1, round=`wb-r1` など複数試合あるラウンド）
  3. 開始コースドロップダウン (`#bm-finals-start-course`) で `2` （バトルコース2）を選択
  4. ダイアログが閉じないことを確認
  5. toast (`courseAssigned` または同等のメッセージ) が表示されることを確認
  6. API で matchNumber=1 の `startingCourseNumber` が 2 に永続化されていることを確認
  7. **同じ round に属する他の全マッチも `startingCourseNumber=2` になっていることを API レスポンスで確認**
  8. `null` （`-`）を選択するとクリアされ、API でも同じ round の全マッチが `null` になることを確認
- **期待結果**: 選択即保存。同一ラウンド全試合に同じ値が伝播する。
- **スクリプト**: tc-bm.js TC-525

## TC-518: BM 予選 — 2名トーナメントで TV 番号セレクトが描画される
- **URL**: /tournaments/[id]/bm
- **authRequired**: true (admin)
- **背景**: 最小構成（2名、グループA）でも TV 番号ドロップダウン（`select.w-14`）が管理者向けに描画されること。
- **手順**:
  1. プレイヤー 2名を作成
     - issue #1030 の再発防止として、作成時に `/api/players` が一時的な 5xx を返した場合は同じUIフォームから限定回数だけ再送し、最終失敗時はHTTP statusとレスポンス本文をサマリに残す
     - レスポンス本文が空の場合は `{}` ではなく空本文として診断でき、成功・競合・4xx は non-transient として同じ条件で観測を終了する
  2. BM グループA に 2名を設定（1試合、BYE なし）
  3. /bm を表示、`select.w-14` が存在し 1〜4 の option を持つことを確認
  4. TV#4 を選択 → API で tvNumber=4 が永続化されることを確認
  5. クリーンアップ
- **期待結果**: 2名 BM でも TV セレクトが機能する
- **スクリプト**: tc-all.js TC-518

## TC-524: BM 決勝 — ブラケット生成後の startingCourseNumber ランダム割り当て (issue #671)
- **URL**: /api/tournaments/[id]/bm/finals
- **authRequired**: true (admin)
- **背景**: `createBmRoundStartingCourses` が Fisher-Yates シャッフルで [1,2,3,4] をランダム化し、ラウンドごとに同一の開始コースを割り当てる。8 名 / 16 名 / Top-24 の playoff 段すべてで同じ性質を満たす。
- **手順**:
  1. 8名ブラケットを生成
  2. 全決勝マッチを取得し、`startingCourseNumber` が 1〜4 の整数であることを確認
  3. 同一ラウンド内の全マッチが同じ `startingCourseNumber` を共有することを確認
- **期待結果**: 全マッチが有効な開始コースを持ち、同じラウンド内は統一される
- **スクリプト**: tc-bm.js TC-524

## TC-526: BM 決勝 — noCamera プレイヤーへの TV# 割り当て時に警告 toast が出る (issue #674)
- **URL**: /tournaments/[id]/bm/finals
- **authRequired**: true (admin)
- **背景**: TV 番号割り当て後、試合のいずれかのプレイヤーが `noCamera: true` の場合、配信設定確認を促す warning toast が表示される（割り当て自体は成功する）。
- **手順**:
  1. 8名ブラケットを生成
  2. M1 の player1 の `noCamera` を true に設定
  3. /bm/finals を開き、M1 スコアダイアログで TV# を選択
  4. success toast（TV# 割り当て成功）が表示されることを確認
  5. warning toast（`[data-sonner-toast][data-type="warning"]`）が表示されることを確認
  6. `noCamera` を false に戻してクリーンアップ
- **期待結果**: TV# 割り当ては成功し、noCamera 警告 toast が追加で表示される
- **スクリプト**: tc-bm.js TC-526

## TC-528: BM 予選 — startingCourseNumber は常に null である（リグレッション防止 / issue #728）
- **URL**: /api/tournaments/[id]/bm (GET)
- **authRequired**: false (GET)
- **背景**: BM 予選では「開始コース」割り当ては仕様外。issue #724 で導入された per-day ランダム割り当ては誤実装のため撤去された。予選セットアップ直後の全マッチが `startingCourseNumber === null` であることを保証する。
- **手順**:
  1. 28名予選済みの共有トーナメントの BM qualification データを GET で取得
  2. 全マッチ（BYE 含む）の `startingCourseNumber` が `null` であることを確認
- **期待結果**: BM 予選 API レスポンスのどのマッチも `startingCourseNumber === null`
- **スクリプト**: tc-bm.js TC-528

## TC-529: BM 決勝 Top-24 経路 — playoff_r1 / playoff_r2 でラウンドごとに startingCourseNumber が揃う (issue #728)
- **URL**: /api/tournaments/[id]/bm/finals (POST → GET)
- **authRequired**: true (admin)
- **背景**: Top-24（24名）モードの BM 決勝は最初に「playoff」ステージ 8 試合（playoff_r1 ×4 + playoff_r2 ×4）を作る。BM 決勝バグ修正（issue #728）後、playoff ステージのマッチも `startingCourseNumber` を持ち、各 round で 4 試合の値が揃う。
- **手順**:
  1. 24名以上の予選済みトーナメントで `POST /bm/finals topN=24` を実行（Phase 1: playoff ステージ作成）
  2. `GET /bm/finals` で playoff ステージのマッチを取得
  3. playoff_r1 の 4 試合の `startingCourseNumber` がすべて 1〜4 の同じ値であることを確認
  4. playoff_r2 の 4 試合の `startingCourseNumber` がすべて 1〜4 の同じ値であることを確認（playoff_r1 と異なる値でも OK）
- **期待結果**: playoff ステージの全マッチが 1〜4 の値を持ち、同一 round 内で揃う
- **スクリプト**: tc-bm.js TC-529

## TC-530: BM 決勝/プレーオフ — startingCourseNumber の明示クリアが GET で維持される
- **URL**: /api/tournaments/[id]/bm/finals (GET)
- **authRequired**: true (admin)
- **背景**: mixed null/non-null のレガシー行は GET 時に自動修復する（ユニットテストで検証）。一方、公開 PATCH API で `startingCourseNumber: null` を送ると同一ラウンド全体を明示的にクリアするため、GET がこれを勝手に補充してはいけない。
- **手順**:
  1. 8名ブラケットを生成（TC-524 と同じ手順）
  2. `PATCH /bm/finals` で `winners_qf` の 1 試合に `startingCourseNumber: null` を送信し、ラウンド全体をクリア
  3. `GET /bm/finals` を呼び出し
  4. レスポンス上で `winners_qf` の全試合が `startingCourseNumber === null` のままであることを確認
  5. 再度 GET しても null 状態が安定（変動しない）ことを確認
- **期待結果**: 公開 API で明示クリアした all-null ラウンドは GET 応答で自動補充されず、後続 GET でも null が維持される
- **スクリプト**: tc-bm.js TC-530

## TC-531: BM 決勝ブラケット — ラウンド名の下に startingCourseNumber が表示される (issue #731)
- **URL**: /tournaments/[id]/bm/finals (UI)
- **authRequired**: true (admin)
- **背景**: issue #731 の要求に基づき、BM 決勝・プレイオフブラケットの各ラウンドヘッダー下に「バトルコース {n}」を表示するようになった。ブラケット生成後に UI ページを開き、コース番号が正しく表示されているかを確認する。issue #889 の回帰防止として、Playwright の相対 URL `goto` ではなく、preview/base URL を付与する `nav` ヘルパー経由で `/bm/finals` を開く。
- **手順**:
  1. 8名 BM 決勝ブラケットを生成（TC-524 と同じ手順）
  2. /tournaments/[id]/bm/finals を開く
  3. 少なくとも 1 つのラウンドヘッダー下に「バトルコース」テキストが表示されていることを確認
  4. playoff_r1 / playoff_r2 がある場合（topN=24 モード）も同様に確認
- **期待結果**: winners_qf 等のラウンドヘッダー下に startingCourseNumber が「バトルコース {n}」として表示される
- **スクリプト**: tc-bm.js TC-531

## TC-1011: BM 決勝生成 — 空の qualification orderBy では H2H クエリを発行しない
- **URL**: /api/tournaments/[id]/bm/finals (POST)
- **authRequired**: true (admin)
- **背景**: issue #1011。`hasAutomaticRankTies` は決勝シード用の予選順位に自動同順位がある場合だけ H2H 用 qualification match を追加取得する。`qualificationOrderBy` が空なら比較基準がないため、JavaScript の `[].every()` の vacuous truth で全行を同順位扱いしてはいけない。
- **手順**:
  1. 8名分の BM qualification を用意する
  2. テスト専用設定で `qualificationOrderBy: []` の finals handler を作る
  3. `POST /api/tournaments/[id]/bm/finals` `{ topN: 8 }` を実行する
  4. `stage: 'qualification'` の H2H match 取得が呼ばれず、決勝ブラケット作成だけが進むことを確認する
- **期待結果**: 空の orderBy は「比較基準なし」として扱われ、不要な H2H クエリを発行しない
- **スクリプト**: n/a（defensive server-side guard のため `smkc-score-app/__tests__/static/tc-1011-finals-h2h-guard.test.ts` + `smkc-score-app/__tests__/lib/api-factories/finals-route.test.ts` で検証）

## TC-532: BM 予選順位表 — 0-1000 予選点列の表示
- **URL**: /tournaments/[temp-id]/bm
- **authRequired**: true (admin)
- **背景**: BM 予選順位表の `得点` は wins×2+ties の生勝点であり、総合ランキング用の最大1000点換算とは別である。予選点列を別表示し、2桁の勝点と混同しないようにする。
- **手順**:
  1. 28名 BM 予選を作成し、全予選試合にスコアを投入する
  2. BM 予選順位表を開く
  3. `予選点` / `Qual Pts` 列が表示され、ヘッダーの title に 0-1000 正規化の説明があることを確認する
  4. 同列の各行が整数で、0〜1000 の範囲に収まることを確認する
- **期待結果**: スコア入力後の BM 順位表に予選点列と説明 title が表示され、少なくとも1行が0より大きい 0〜1000 点の値を持つ
- **スクリプト**: tc-bm.js TC-503 内で検証

## TC-533: BM 予選順位表 — 合算順位タブの表示
- **URL**: /tournaments/[temp-id]/bm
- **authRequired**: true (admin)
- **背景**: 2Pモードは複数グループに分かれるが、閲覧・確認用に全グループを合算したランキングも必要。決勝配置用のグループ内順位とは別に、BM 予選ページで表示専用の合算順位タブが動作することを確認する。
- **手順**:
  1. 28名 BM 予選を作成し、全予選試合にスコアを投入する
  2. BM 予選ページを開く
  3. `合算順位` / `Combined` タブが表示されていることを確認する
  4. タブをクリックし、テーブルに行データが表示されることを確認する
  5. `Failed to fetch` やエラー表示が出ていないことを確認する
  6. 順位列が昇順に並んでいることを確認する
- **期待結果**: BM の合算順位タブが全グループの参加者を表示し、順位列が昇順で描画される
- **スクリプト**: tc-bm.js TC-533

## TC-534: BM Top-24 Phase 2 preview — winner 不定時の warning
- **URL**: /tournaments/[id]/bm/finals
- **authRequired**: true (admin)
- **背景**: Top-24 playoff の Phase 2 preview は `playoff_r2` が completed でも同点・欠損 playerId などで winner を決められない場合がある。該当シードを静かに欠落させると Phase 2 デバッグが難しくなるため、未解決 winner を warning として残す。
- **手順**:
  1. Top-24 playoff を生成し、`playoff_r2` のうち 1 試合を winner 不定の completed 状態にする
  2. `GET /api/tournaments/[id]/bm/finals` で Phase 2 preview を取得する
  3. preview は取得できるが、未解決 winner の `matchNumber` と `advancesToUpperSeed` が warning に記録されることを確認
- **期待結果**: Phase 2 preview は未解決 winner を黙って無視せず、原因調査に使える warning を残す
- **スクリプト**: n/a（server-side warning のため `smkc-score-app/__tests__/lib/api-factories/finals-route.test.ts` で検証）

## TC-1047: BM Top-24 Phase 2 preview — preview 構築失敗時の最小 structured error logging
- **URL**: /api/tournaments/[id]/bm/finals (GET)
- **authRequired**: true (admin)
- **背景**: issue #1047/#1045/#1628/#1630。Top-24 playoff が存在する GET preview で qualification 読み込みや ranking 計算が失敗しても、ユーザー向けには従来どおり playoff 状態へフォールバックする。一方で無言の `catch` は本番調査を妨げるため、errorName・errorCode・tournamentId・eventTypeCode を構造化ログに残し、Prisma error オブジェクト全体や preview 入力型の `any`/`unknown` へ戻さない。
- **手順**:
  1. Top-24 playoff stage が存在し、finals stage が未作成の大会を用意する
  2. `GET /api/tournaments/[id]/bm/finals` の Phase 2 preview 構築中に qualification 読み込み失敗を再現する
  3. API レスポンスは 200 の playoff フォールバックを返すことを確認する
  4. logger は preview 構築失敗を `error` として、最小化した errorName/errorCode・大会ID・イベント種別付きで記録することを確認する
  5. static test で `buildTop24FinalsPreview` の `playoffMatches` と qualification player 型が `any[]` / `unknown` に戻っていないことを確認する。コメント文言ではなくログ helper 呼び出しと出力フィールドだけを固定する。
- **期待結果**: Top-24 preview の一時的な失敗は UI を壊さずフォールバックしつつ、クエリ詳細を含み得る Error オブジェクト全体をログに渡さず、原因調査に必要な最小構造化 error log と型安全な入力契約を維持する
- **スクリプト**: n/a（server-side fallback/logging のため `smkc-score-app/__tests__/lib/api-factories/finals-route.test.ts` + `smkc-score-app/__tests__/static/tc-1047-top24-preview-logging.test.ts` で検証）

## TC-535: BM Top-24 playoff — 予選グループ順位ラベル表示
- **URL**: /tournaments/[id]/bm/finals
- **authRequired**: true (admin)
- **背景**: Top-24 playoff と Phase 2 finals preview は、紙の組み合わせ表に合わせて seed 番号だけでなく `A8` / `B7` などの予選グループ内順位ラベルを表示する。`buildQualificationRankLabelMap` は各グループ内で順位順に並んだ qualification 入力からこのラベルを作るため、入力順と UI 表示の両方を固定する。
- **手順**:
  1. 28名 BM 予選を作成し、2グループの順位を確定する
  2. Top-24 playoff を生成し、`playoffSeededPlayers` が barrage seed ごとに `qualificationRankLabel` を持つことを確認する
  3. playoff Round 1/2 の表示で seed 番号 `[1]` ではなく group-rank ラベル `[A9]` / `[B12]` 等が表示されることを確認する
  4. playoff 完了後に Phase 2 finals を生成し、direct seed 側も `qualificationRankLabel` を保持していることを確認する
- **期待結果**: Top-24 playoff と Phase 2 finals のシード表示は、seed 番号ではなく予選グループ順位ラベルを優先する
- **スクリプト**: tc-bm.js TC-510（API payload の `qualificationRankLabel` を検証） + `smkc-score-app/__tests__/components/tournament/playoff-bracket.test.tsx`（UI 表示を検証）

## TC-1053: BM Top-24 Phase 2 — playoff upper seed 定義欠損を検出する
- **URL**: /api/tournaments/[id]/bm/finals (POST)
- **authRequired**: true (admin)
- **背景**: issue #1053。Top-24 Phase 2 は `generatePlayoffStructure(12)` の `playoff_r2` 4試合にある `advancesToUpperSeed` を使い、playoff 勝者を Upper Bracket の seed 16/12/14/10 に配置する。構造定義の変更やバグで `playoffUpperSeeds` が4件そろわない場合、勝者を欠落させたままブラケットを作ると原因調査が難しい。
- **手順**:
  1. 24名以上の予選済みトーナメントで Top-24 playoff を作成する
  2. `playoff_r2` の4試合を completed にする
  3. テストでは `generatePlayoffStructure(12)` が `playoff_r2` の `advancesToUpperSeed` を返さない状態を再現する
  4. `POST /bm/finals { topN: 24 }` で Phase 2 を生成しようとする
  5. Phase 2 作成が `Expected 4 playoff R2 upper seeds` の guard で停止し、finals stage の `createMany` が呼ばれないことを確認する
- **期待結果**: Top-24 Phase 2 は `playoffUpperSeeds` が4件そろわない構造を無音で受け入れず、Upper Bracket 勝者シード欠落を防ぐ
- **スクリプト**: n/a（構造異常のサーバーサイド防御のため `smkc-score-app/__tests__/static/tc-1053-playoff-upper-seeds-guard.test.ts` + `smkc-score-app/__tests__/lib/api-factories/finals-route.test.ts` で検証）

## TC-1051: BM Top-24 — directSeeds を唯一の direct advancer 公開契約にする
- **URL**: /api/tournaments/[id]/bm/finals (POST)
- **authRequired**: true (admin)
- **背景**: issue #1051。2グループ Top-24 の direct advancer は Upper Bracket seed 1/2/3/4/5/6/7/8/9/11/13/15 に配置されるため、呼び出し側に必要なのは seed 付きの `directSeeds` である。旧 `direct[]` は `directSeeds[].qualification` から派生できる冗長な配列で、2グループでは source of truth を増やすだけになる。
- **手順**:
  1. 28名 BM 予選を2グループで完了し、Top-24 playoff を作成する
  2. playoff 完了後に Phase 2 finals を生成する
  3. Phase 1/2 の API payload が legacy `direct[]` を公開せず、Phase 2 の `seededPlayers` が `directSeeds` 由来の Upper Bracket seed へ配置されることを確認する
  4. ユニットテストで `selectFinalsEntrantsByGroup` の戻り値も `direct[]` を持たず、3/4グループの内部 direct order は `directSeeds` として保持されることを確認する
- **期待結果**: BM Top-24 の公開契約は `directSeeds` と `barrage` に集約され、2グループ専用の冗長 `direct[]` が再導入されない
- **スクリプト**: tc-bm.js TC-510 内の TC-1051 assertion + `smkc-score-app/__tests__/lib/finals-group-selection.test.ts`

## TC-1052: BM Top-24 — 3グループ時は未定義のシード衝突を拒否する
- **URL**: /api/tournaments/[id]/bm/finals (POST)
- **authRequired**: true (admin)
- **背景**: issue #1052。現行の Top-24 紙配置は2グループ専用で、playoff_r2 勝者が Upper Bracket の seed 16/12/14/10 に入る。3グループの暫定 interleave をそのまま使うと direct seed 10/12 とバラッジ勝者 seed 10/12 が衝突するため、3+グループ用の正式配置が決まるまでは明示的に拒否する。
- **手順**:
  1. 管理者セッションでAPIから3グループの BM 予選作成を試みる
  2. setup API が3グループを400で拒否した場合は、その時点でplayoff/finals stage のマッチが作成されていないことを確認する
  3. setup が通った環境では全予選マッチを completed にし、`POST /api/tournaments/[id]/bm/finals` `{ topN: 24 }` を実行する
  4. レスポンスが 400 `VALIDATION_ERROR` で、`qualifications` フィールドのエラーとして「Top-24 は最大2グループまで対応」と分かることを確認する
- **期待結果**: 3+グループの Top-24 はsetupまたはfinals生成のどちらかで拒否され、サイレントに壊れたブラケットを作らない
- **スクリプト**: tc-bm.js TC-1052 + `smkc-score-app/__tests__/lib/api-factories/finals-route.test.ts`

## TC-1010: BM 16-player finals — rankOverride seeding と Overall Ranking 位置ポイント
- **URL**: /api/tournaments/[id]/bm/finals, /api/tournaments/[id]/overall-ranking
- **authRequired**: true (admin)
- **背景**: issue #1010。16-player finals の bracket 作成は確定済みの `rankOverride` を seed 順に反映し、Overall Ranking は losers_r4 敗者を5位相当、losers_r3 敗者を7位相当の BM finals points として扱う必要がある。
- **手順**:
  1. 管理者で一時トーナメントと16名の BM qualification を作成する
  2. 16人目の qualification に `rankOverride: 1` を設定して BM 予選を確定する
  3. Top-16 finals bracket を作成し、返却された `seededPlayers` の先頭が rankOverride 対象者であることを確認する
  4. winners/losers bracket を losers_r4 と losers_r3 の敗者が確定するまで進める
  5. Overall Ranking を再計算し、該当敗者の BM finals points を確認する
- **期待結果**: rankOverride 対象者が seed 1 に入り、losers_r4 敗者は750点（5位相当）、losers_r3 敗者は550点（7位相当）になる
- **スクリプト**: `E2E_TESTS=TC-1010 node e2e/tc-bm.js` + `smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts` + `smkc-score-app/__tests__/lib/api-factories/finals-route.test.ts` + `smkc-score-app/__tests__/lib/points/overall-ranking.test.ts`

## TC-1603: BM Top-24 — 1グループ時も予選グループ数エラーで停止する
- **URL**: /api/tournaments/[id]/bm/finals (POST)
- **authRequired**: true (admin)
- **背景**: issue #1603。3+グループ拒否 guard は `groupCount > 2` を見るため、1グループ入力は `selectFinalsEntrantsByGroup` 側の「2〜4グループのみ対応」バリデーションで止まる。この経路が書き込み前に 400 になることを明示する。
- **手順**:
  1. 1グループ24名分の BM 予選済みデータを用意する
  2. `POST /api/tournaments/[id]/bm/finals` `{ topN: 24 }` を実行する
  3. レスポンスが 400 `VALIDATION_ERROR` で、`Unsupported group count 1` が返ることを確認する
  4. playoff/finals stage のマッチが作成されていないことを確認する
- **期待結果**: 1グループの Top-24 も未定義ブラケットを作らず、予選グループ数バリデーションで安全に停止する
- **スクリプト**: n/a（server-side guard のため `smkc-score-app/__tests__/lib/api-factories/finals-route.test.ts` で検証）

---

## MR (Match Race) フルワークフローテスト

### 設計方針
- BMテスト(TC-5xx)と対称に構成。BMとの差異（決勝がレース形式、コース割当あり）以外は同じシナリオ
- **予選プレイヤー数**: 28名（4グループ × 7名、奇数のためBYEあり）
- **予選試合数**: 7名RR = 21試合 × 4グループ = **84試合**
- **決勝形式**: best-of-5 races (first-to-3)、5レース分のコース選択+勝者選択
- 単発の participant テスト (TC-602/603/608/609/610/611/612) は 2 名のみで設置

## TC-601: MR予選フルフロー（28名、シード、4グループ snake-draft）
- **URL**: /tournaments/[temp-id]/mr
- **authRequired**: true (admin)
- **手順**:
  1. 管理者セッションで一時トーナメントと **28名** のプレイヤーを作成
  2. MR予選グループ設定APIで28名をシード1〜28で登録、4グループ（A/B/C/D × 7名）に snake-draft で自動振り分け
     - boustrophedon: row r = floor(i/4), col = i%4 (even row) / 3-i%4 (odd row)
  3. APIレスポンスで各グループに7名が割り当てられていることを確認
  4. 各グループの全試合（7名RR = 21試合 × 4グループ = 84試合）のスコアを API で入力
     - score1+score2=4 のルール（例: 3-1, 2-2, 4-0 等）。test スコアパターンは循環使用
  5. MR予選ページを開き、順位表に全28名が表示されること
  6. 各グループの順位表が score desc → points desc で正しくソートされていること
  7. コース割当がランダムシャッフルされていること（rounds配列にcourse情報あり）
  8. クリーンアップ
- **期待結果**: 28名4グループのMR予選がシード・自動振り分けで正しく設定・実行・集計される

## TC-1079: MR予選コース割り当て — roundNumber は正の1始まりだけを使う
- **URL**: /tournaments/[temp-id]/mr
- **authRequired**: true (admin)
- **背景**: MR 予選コース選択は `(roundNumber - 1) * 4` でシャッフル済みコースデッキを参照する。`roundNumber <= 0` や `NaN` / `Infinity` が混入すると round 1 と同じコースへサイレントにフォールバックし、呼び出し元のバグを隠す可能性がある。
- **手順**:
  1. 28名 MR 予選を作成し、全予選試合にスコアを投入する
  2. BYE を除いた全マッチの `roundNumber` が `Number.isInteger` で検証できる正の1始まり整数であることを確認する
  3. 同じ `roundNumber` のマッチが同じ4コースの `assignedCourses` を持つことを確認する
  4. `0` / `-1` / `1.5` / `NaN` / `Infinity` 入力時の例外を `qualification-route.test.ts` で確認する
- **期待結果**: E2E の MR 予選生成経路は有限な `roundNumber >= 1` のみを返し、単体ガードは不正な roundNumber を round 1 に丸めず例外にする
- **スクリプト**: tc-mr.js TC-601 内で検証

## TC-602: MR予選プレイヤーログインからスコア入力・送信まで
- **URL**: /auth/signin -> /tournaments/[temp-id]/mr/participant
- **authRequired**: true (player)
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー2名を作成し、一時パスワードを取得する
  2. 一時トーナメントでMR予選をグループ設定APIで作成し、2名のpendingマッチを生成する
  3. 別の一時ブラウザコンテキストで対象プレイヤー（player1）としてログインする
  4. `/tournaments/[temp-id]/mr/participant` を開き、pendingマッチが表示されることを確認する
  5. レース結果を入力: 各レースでコース選択+ポジション入力、score1=3, score2=1 相当になるよう設定
  6. 「Submit Scores」をクリックし、成功アラートが表示されpendingマッチが消えることを確認する
  7. 管理者APIで対象マッチがcompletedになり、score1=3, score2=1が保存されていることを確認する
  8. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: MRのparticipant入力フォームからレース結果を送信でき、結果が永続化される

## TC-1083: MR participant 過去報告表示とスコア修正フロー
- **URL**: /tournaments/[temp-id]/mr/participant
- **authRequired**: true (player)
- **背景**: issue #1083。BM participant は確定済み試合で過去報告を表示し、「Correct Score」から参加者自身が修正できる。MR participant も同じデータフィールド (`player1ReportedPoints*` / `player2ReportedPoints*`) と correction API を持つため、UI でも同等の確認・訂正導線が必要。
- **回帰チェック**: issue #1463/#1464/#1466。修正送信後は固定 sleep ではなく更新済みスコアを条件待機し、MR スコアエディタは `MrScoreEditor` コンポーネントとしてページ外に切り出して再利用する。ドキュメント確認は drift test に一本化し、static test は実装ガードに集中する。
- **手順**:
  1. 管理者セッションでMR予選2名マッチを作成する
  2. player1 として `/mr/participant` にログインし、3-1 を送信する
  3. 試合確定後、過去報告と `Correct Score` ボタンが表示されることを確認する
  4. `Correct Score` を開き、3-1 から 2-2 に修正して `Submit Correction` を送信する
  5. 管理者APIで対象マッチが completed のまま score1=2, score2=2 に更新されていることを確認する
- **期待結果**: MR participant で過去報告を確認でき、確定済みスコアを参加者自身が修正できる
- **スクリプト**: `tc-mr.js TC-1083`

## TC-1082: BM/MR participant スコア入力ロジック共通化
- **URL**: /tournaments/[temp-id]/bm/participant, /tournaments/[temp-id]/mr/participant
- **authRequired**: true (player)
- **背景**: issue #1082。BM/MR participant ページの `getInitialScores` / `hasOwnReport` / `adjustScore` / `handleSubmitScore` は同じ入力ルールを持つ。BM は `player*ReportedScore*`、MR は `player*ReportedPoints*` を読む差分だけを page 側に残し、共通処理は `useParticipantScoreInput` に集約する。
- **回帰チェック**:
  1. BM と MR の participant ページはいずれも `useParticipantScoreInput` を使い、ページ内に重複した初期スコア計算・送信処理を持たない
  2. 未編集の確定済み試合を送信する場合、BM/MR とも `getInitialScores(match)` の completed score fallback を使う
  3. issue #1469/#1470 の再発防止として、クランプ値は `maxScorePerSide`、合計値は `requiredTotalScore` で揃えられ、`clearScores` は public hook API として公開されない
  4. issue #1472/#1473 の再発防止として、呼び出し元 UI の `totalValid` も hook から返る `requiredTotalScore` を参照し、`maxScorePerSide < requiredTotalScore` の valid/invalid 境界を unit test で固定する
  5. issue #1475/#1476/#1478 の再発防止として、テストヘルパーの `totalMustEqualMessage` は可変にし、`maxScorePerSide` は未使用の public return API として公開しない。static guard は return object を正規表現で検証し、インデントに依存しない
  6. issue #1480 の再発防止として、static guard は `return { ... }` 内にネストしたオブジェクトリテラルが先に来ても後続プロパティを見落とさないよう、TypeScript AST で hook の最上位 return object を抽出して検証する
  7. issue #1482 と issue #1484 の再発防止として、return object helper は function declaration だけでなく block-body arrow function、concise-body arrow function、function expression の hook 形式も検査できる
  8. 既存 UI シナリオは BM `TC-322` と MR `TC-1083` が担当し、共通化の構造は static/unit test で固定する
- **期待結果**: BM/MR participant のスコア入力ロジックが共通フックで維持され、mode-specific な報告フィールド差分だけが各ページに残る
- **スクリプト**: static guard `__tests__/static/tc-1082-shared-score-input.test.ts` + unit `__tests__/lib/hooks/useParticipantScoreInput.test.ts`

## TC-603: MR引き分け(2-2)スコアの受理確認
- **URL**: /api/tournaments/[temp-id]/mr (PUT)
- **authRequired**: true (admin)
- **背景**: §4.1により2-2引き分けは有効（draw = 1ポイント）。バリデーションが2-2を正しく受理するかを検証
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー2名を作成する
  2. MRグループ設定を行い、pendingマッチを生成する
  3. 管理者APIでscore1=2, score2=2（引き分け）をPUTで送信する
  4. HTTP 200で受理されることを確認する
  5. PUTレスポンスの `match` は `player1Id/player2Id` を含み、不要な `player1/player2` 展開を含まないことを確認する
  6. マッチがcompletedかつscore1=2, score2=2で保存されていることを確認する
  7. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: 2-2の引き分けスコアがバリデーションを通過し正常に保存される

## TC-604: MR予選28名フル + 決勝ブラケット生成 + race-format UI スコア入力
- **URL**: /tournaments/[temp-id]/mr/finals
- **authRequired**: true (admin)
- **手順**:
  1. 管理者セッションで一時トーナメントと **28名** のプレイヤーを作成
  2. MR予選グループ設定 (4グループ × 7名) → 全 84 試合を API で 3-1 入力
  3. `/mr/finals` を開き、「Generate Bracket」→「Top 8」→「Generate」をクリック
  4. ダブルイリミネーションブラケットが生成されること（17試合）
  5. M1 に対して 3-3 を API PUT → 400 拒否（first-to-3 なのでどちらか一方が 3 必須）
  6. M1 ダイアログを UI で開き、各レースのコース選択＋勝者選択で P1 3勝にして「Save」
  7. 勝者が M5、敗者が M8 に移動していること（routing）
  8. クリーンアップ
- **期待結果**: 28名予選→Top 8抽出→MR決勝ブラケット生成→ race-format スコア入力→ routing が全て正常動作

## TC-605: MR決勝ブラケットリセット（28名予選後）
- **URL**: /tournaments/[temp-id]/mr/finals
- **authRequired**: true (admin)
- **手順**:
  1. TC-604 と同様に 28名予選 + ブラケット生成
  2. M1 に 3-0 で API PUT
  3. ブラケット生成 API を再 POST（=「Reset Bracket」UI 動作と同等）
  4. 全 17 マッチが pending 状態に戻ること
  5. クリーンアップ
- **期待結果**: ブラケットリセットで全マッチが未完了状態に戻る

## TC-606: MR Grand Final → チャンピオン決定（28名予選後）
- **URL**: /tournaments/[temp-id]/mr/finals
- **authRequired**: true (admin)
- **手順**:
  1. 28名予選 + 決勝ブラケット生成
  2. M1〜M16 を P1 win 3-0 で API 連続入力
     - Winners: QF(1-4), SF(5-6), WF(7)
     - Losers : L_R1(8-9), L_R2(10-11), L_R3(12-13), LSF(14), LF(15)
     - Grand Final: M16 (best-of-5 races, first-to-3)
  3. M16 で Winners 側勝者 (P1) が 3-0 で勝つ
  4. `/mr/finals` ページの `body.innerText` にチャンピオンの nickname と "Champion/チャンピオン/優勝" のいずれかが含まれること
  5. クリーンアップ
- **期待結果**: 全マッチ完了後にチャンピオンが正しく決定・表示される

## TC-607: MR Grand Final Reset Match（28名予選後）
- **URL**: /tournaments/[temp-id]/mr/finals
- **authRequired**: true (admin)
- **背景**: Grand Final で Losers 側が勝った場合、Reset Match (M17) が発生する
- **手順**:
  1. TC-606 と同様に M1〜M15 を P1 win 3-0 で消化
  2. M16 で Losers 側勝者 (P2) が 0-3 で勝つようにスコア入力
  3. M17 (Grand Final Reset) が出現し両プレイヤーが populate されること
  4. M17 にスコア入力（L-side 勝者を勝たせる）→ completed
  5. クリーンアップ
- **期待結果**: Grand Final Reset が正しくトリガーされ、最終勝者がチャンピオンとなる

## TC-608: MR二重報告 — 双方一致で自動確定
- **URL**: /tournaments/[temp-id]/mr/participant
- **authRequired**: true (player × 2)
- **背景**: dualReportEnabled=true のトーナメントでは両プレイヤーが同じスコアを報告すると自動確定
- **手順**:
  1. 管理者セッションで dualReportEnabled=true のトーナメントとプレイヤー2名を作成
  2. MRグループ設定でpendingマッチを生成
  3. 一時ブラウザでP1としてログインし /mr/participant でスコア3-1を送信
  4. レスポンスに `waitingFor: player2` が含まれることを確認
  5. 管理者APIでマッチが未完了(completed=false)かつ player1ReportedScore1=3 であることを確認
  6. 別の一時ブラウザでP2としてログインし /mr/participant でスコア3-1を送信
  7. レスポンスに `autoConfirmed: true` が含まれることを確認
  8. 管理者APIでマッチが completed=true, score1=3, score2=1 であることを確認
  9. クリーンアップ
- **期待結果**: 双方が同じスコアを報告するとマッチが自動確定される

## TC-609: MR二重報告 — 不一致でmismatch検出
- **URL**: /tournaments/[temp-id]/mr/participant
- **authRequired**: true (player × 2)
- **背景**: 両プレイヤーが異なるスコアを報告した場合、mismatchフラグが立ち管理者レビュー待ちになる
- **手順**:
  1. 管理者セッションで dualReportEnabled=true のトーナメントとプレイヤー2名を作成
  2. MRグループ設定でpendingマッチを生成
  3. P1が3-1でスコア報告
  4. P2が1-3でスコア報告（不一致）
  5. レスポンスに `mismatch: true` が含まれることを確認
  6. 管理者APIでマッチが completed=false のままであることを確認
  7. 管理者がPUTでスコアを確定し、completed=true になることを確認
  8. クリーンアップ
- **期待結果**: 不一致時はマッチが未完了のままで管理者レビュー待ちになる

## TC-610: MR決勝 — 非管理者のスコア入力拒否
- **URL**: /api/tournaments/[temp-id]/mr/finals
- **authRequired**: true (player — 管理者ではない)
- **背景**: 決勝ではBM/MR/GP共通でputRequiresAuth: trueが設定されており管理者のみがスコア入力可能。MRで検証することで共通ファクトリの動作を確認
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー8名を作成する
  2. MR予選→全マッチ完了→ブラケット生成まで実行する
  3. プレイヤーとしてログインし、MR決勝APIにPUTリクエストを送る
  4. HTTP 403 Forbidden が返ることを確認する
  5. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: MR決勝スコア入力は管理者のみ許可され、プレイヤーは403で拒否される

## TC-617: MR決勝 — 同じラウンドの全試合で同一コースセット (PR #585 正規化)
- **URL**: /api/tournaments/[temp-id]/mr/finals (GET)
- **authRequired**: true (admin)
- **背景**: Playoff / Finals ブラケットでは「同じラウンドの試合はすべて同じコースセット」(M1が `[MC, DP, GV]` なら M2・M3・M4 も同じ)。TC-717 の MR 版。GP の cup と違い MR は `assignedCourses: string[]`（ベストオブNの最大ラウンド数に応じて 3〜5コース）。legacy データの divergent state は GET 時に `normalizeRoundCoursesToSingleSet` がラウンド内の最多出現パターンへ per-row update で収束させる。
- **手順**:
  1. 28名予選 + 決勝ブラケット生成（17試合）
  2. `GET /api/.../mr/finals` で全マッチ取得
  3. `round` で bucket し、各ラウンド内の `assignedCourses` が配列として等価・かつ空でないことを確認
  4. クリーンアップ
- **期待結果**: winners_qf / winners_sf / winners_final / losers_r1..r3 / losers_sf / losers_final / grand_final / grand_final_reset の各ラウンドで、すべてのマッチが同一の `assignedCourses` を保持

## TC-618: MR決勝 — 管理者の手動合計スコア入力 (PR #585 マニュアルフォーム)
- **URL**: /api/tournaments/[temp-id]/mr/finals (PUT)
- **authRequired**: true (admin)
- **背景**: 予選ページ同様、決勝の管理者ダイアログでチェックボックスをオンにすると race 入力をスキップしてベストオブN の合計スコアを直接入力できる。body に `rounds` が含まれない場合、保存済みの rounds[] breakdown は温存されなければならない（`putAdditionalFields` が undefined なフィールドをスキップする契約）。
- **手順**:
  1. 28名予選 + 決勝ブラケット生成
  2. M1 に通常の `{ matchId, score1: 5, score2: 2, rounds }` で PUT → rounds 配列が保存される
  3. 続けて M1 に `{ matchId, score1: 5, score2: 4 }` のみ（rounds を**含まない**）で PUT → 200
  4. `GET` で M1 を再取得し、`score1=5`、`score2=4`、`rounds` と `assignedCourses` は手順 2 の値のまま残っていることを確認
  5. クリーンアップ
- **期待結果**: 手動合計スコア PUT で score1/score2 は上書きされ、rounds / assignedCourses はクリアされない

## TC-620: MR 予選同着解決 — 同順位バーが rankOverride 設定後に消える
- **URL**: /tournaments/[temp-id]/mr
- **authRequired**: true (admin)
- **背景** (issue #575): MR は BM/GP と共通の `qualification-route` factory と `rankOverride` フローを使っているため、同着解決の PATCH エンドポイントと同順位バーがそのまま動作する必要がある。TC-324 (BM) / TC-713 (GP) と対になる MR の回帰テスト。
- **手順**:
  1. テスト用プレイヤー3名 + トーナメントを作成
  2. `setupModePlayersViaUi('mr', …)` で予選グループを作成
  3. 全ての非BYE試合を **2-2 ドロー**で PUT（score = wins*2 + ties = 6、points = winRounds - lossRounds = 0 で全員同着）
  4. `/mr` 页面を訪問 → 順位表タブで同順位バー（「同順位が検出されました」/「Tied ranks detected」）が**表示される**ことを確認
  5. `resolveAllTies(mr)` で N 人全員に distinct な `rankOverride` を PATCH
  6. `/mr` 页面を再訪問 → 同順位バーが**消えている**ことを確認
  7. クリーンアップ
- **期待結果**: MR でも BM/GP と同じく rankOverride 設定後に同順位バーが消える

## TC-615: MR Top-24 Playoff UI フロー
- **URL**: /tournaments/[temp-id]/mr → /mr/finals
- **authRequired**: true (admin)
- **背景**: BM TC-515 の MR 版。`topN=24` で MR 決勝生成するとまず 8 試合のバラッジが生成される。UI が以下の流れを正しく提示すること: 予選ページ「Start Playoff」→ sessionStorage に `mr_finals_topN=24` 保存 → Finals ページ Playoff ブラケット表示 → playoff_r2 完了で playoffComplete=true → Phase 2（Upper Bracket）生成
- **手順**:
  1. 28名予選完了状態のトーナメントで qualificationConfirmed=true にし、既存ブラケットをリセットする
  2. 予選ページ（`/mr`）で「Start Playoff (バラッジ開始)」ボタンが表示されることを確認する
  3. ボタンをクリックし、sessionStorage の `mr_finals_topN` が `"24"` に設定されることを確認する
  4. `/mr/finals` に遷移し「Playoff (Barrage)」ラベルと M1 が表示されることを確認する
  5. playoff_r1 M1〜M4 を 3-0、playoff_r2 M5〜M8 を 3-0 で API 入力し、`playoffComplete=true` を確認する
  6. `POST /mr/finals { topN: 24 }` で Phase 2（Upper Bracket）を生成し `phase='finals'` が返ることを確認する
  7. `/mr/finals` に戻り「Upper Bracket / アッパーブラケット」が表示されることを確認する
  8. クリーンアップ
- **期待結果**: MR Top-24 バラッジの UI フローが全段階で正常動作する（sessionStorage 経由の topN 引き継ぎを含む）

## TC-616: MR 予選ページの決勝ブラケット存在状態 + リセット
- **URL**: /tournaments/[temp-id]/mr
- **authRequired**: true (admin)
- **背景**: BM TC-516 の MR 版。決勝ブラケット生成後に予選ページを再訪すると「View Tournament」が表示される。危険操作である「Reset Bracket」は予選ロック中は非表示で、直接 API リセットも 409 で拒否され、予選ロック解除後のみ表示される
- **手順**:
  1. 28名予選完了状態のトーナメントで qualificationConfirmed=true にし、Top-8 ブラケットを生成する
  2. 予選ページ（`/mr`）を開き「View Tournament / トーナメントを見る」が表示され、「Reset Bracket / ブラケットリセット」が表示されないことを確認する
  3. ロック中に `POST /api/tournaments/[id]/mr/finals { reset: true }` を直接呼び、409 `QUALIFICATION_LOCKED` が返ることを確認する
  4. qualificationConfirmed=false にして予選ロックを解除し、「Reset Bracket / ブラケットリセット」ボタンが表示されることを確認する
  5. 「Reset Bracket / ブラケットリセット」ボタンをクリックし、確認ダイアログで OK を選択する
  6. リセット後は予選が未ロックのままなので、「Reset Bracket」と「Start Playoff / Generate Finals Bracket」が表示されないことを確認する
  7. クリーンアップ
- **期待結果**: ブラケット生成後は「View Tournament」のみ、予選ロック中の直接 API リセットは拒否され、予選ロック解除後だけ「Reset Bracket」が表示され、リセット後は再ロックまで生成ボタンも出ない

## TC-812: TA 予選同着解決 — 同タイムで average 課題ポイント
- **URL**: /tournaments/[temp-id]/ta
- **authRequired**: true (admin)
- **背景** (issue #575): TA は BM/MR/GP と異なり `rankOverride` フローを持たない。代わりに `calculateCourseScores`（`src/lib/ta/qualification-scoring.ts`）が同タイムのプレイヤーに平均化された課題ポイントを配布する。§4.1 の「同着は平均で分ける」ルールを実装レベルで保証する回帰テスト。
- **手順**:
  1. テスト用プレイヤー3名 + トーナメントを作成
  2. `setupTaQualViaUi(…, { seedTimes: false })` で TA エントリーを作成
  3. P1 / P2 に **20 コース全て同一タイム**（`makeTaTimesForRank(1)`）を PUT
  4. P3 に **20 コース全てより遅いタイム**（`makeTaTimesForRank(3)`）を PUT
  5. `/api/tournaments/[id]/ta` で `qualificationPoints` と `rank` を取得し次を確認:
     - N=3 のスコアテーブル [50, 25, 0] で P1/P2 が rank 1-2 で tied → 平均 (50 + 25) / 2 = 37.5 pt × 20 courses = **750 pt** を両者に割り当て
     - P3 は rank 3 で 0 pt
     - サーバ rank は P1/P2 のどちらかが 1、もう一方が 2、P3 は 3
  6. クリーンアップ
- **期待結果**: TA は手動操作なしで同着が平均ポイントで解決され、TC-324/TC-620/TC-713 と同じ同着回帰カバレッジを持つ

## TC-813: TA 予選エントリー削除後のランク再計算 (issue #710/#959)
- **URL**: /api/tournaments/[temp-id]/ta (DELETE), /api/tournaments/[temp-id]/ta (GET)
- **authRequired**: true (admin)
- **背景** (issue #710/#959): `recalculateRanks` は以前 N 件の `TTEntry.update` を直列実行していたため、27エントリー時に ~5s のレスポンス遅延が発生していた。さらに DELETE 後の `rerankStageAfterDelete` が `recalculateRanks` と同じ TA 予選順序（`qualificationPoints DESC`, `totalTime ASC`, `id ASC`）を使わないと、削除後だけ順位がズレる。本 TC はその機能的正確性を確認する回帰テストである。
- **手順**:
  1. テスト用プレイヤー4名 + トーナメントを作成
  2. `setupTaQualViaUi(…, { seedTimes: false })` で TA エントリーを作成
  3. P1 は 19 コースで最速だが 1 コースだけ大きく遅い、P2 は全体 totalTime だけなら P1 より速い、P3/P4 はそれより低いスコアになるタイムを PUT
  4. `/api/tournaments/[id]/ta` で初期ランクが P1=1, P2=2, P3=3, P4=4 であり、P1 は P2 より totalTime が遅いが `qualificationPoints` が高いことを確認
  5. `DELETE /api/tournaments/[id]/ta?entryId={p3EntryId}` で P3 を削除
  6. 再度 GET し、残存エントリーのランクが P1=1, P2=2, P4=3 に再コンパクション済みであることを確認（ギャップなし、かつ totalTime-first にドリフトしていない）
  7. クリーンアップ
- **期待結果**: エントリー削除後に DELETE 専用の再ランク処理が `recalculateRanks` と同じ TA 予選順序で動作し、連続したランクが割り当てられる
- **スクリプト**: tc-ta.js TC-813

## TC-621: MR ラウンド別 targetWins API バリデーション (issue #528)
- **背景**: MR 決勝ブラケットは `FT3/FT4/FT5` の任意設定が可能。BM TC-520 と対称。有効値は `[3, 4, 5]`、それ以外は 422 を返すこと
- **手順**:
  1. 28名予選完了済みフィクスチャで 8名ブラケットを生成する
  2. `PUT /mr/finals { matchId, targetWins: 3 }` → 200
  3. `PUT /mr/finals { matchId, targetWins: 6 }` → 422（無効値）
  4. `PUT /mr/finals { matchId, targetWins: 5 }` → 200
- **期待結果**: 有効値は受け付け、無効値は 422 で拒否される
- **スクリプト**: tc-mr.js TC-621

## TC-622: MR 予選順位表 — 0-1000 予選点列の表示
- **URL**: /tournaments/[temp-id]/mr
- **authRequired**: true (admin)
- **背景**: MR 予選順位表の `得点` は wins×2+ties の生勝点であり、総合ランキング用の最大1000点換算とは別である。予選点列を別表示し、2桁の勝点と混同しないようにする。
- **手順**:
  1. 28名 MR 予選を作成し、全予選試合にスコアを投入する
  2. MR 予選順位表を開く
  3. `予選点` / `Qual Pts` 列が表示され、ヘッダーの title に 0-1000 正規化の説明があることを確認する
  4. 同列の各行が整数で、0〜1000 の範囲に収まることを確認する
- **期待結果**: スコア入力後の MR 順位表に予選点列と説明 title が表示され、少なくとも1行が0より大きい 0〜1000 点の値を持つ
- **スクリプト**: tc-mr.js TC-601 内で検証

## TC-623: MR 予選順位表 — 合算順位タブの表示
- **URL**: /tournaments/[temp-id]/mr
- **authRequired**: true (admin)
- **背景**: MR 予選は複数グループで進行するため、グループ別順位に加えて全グループを横断した確認用ランキングが必要。決勝配置用のグループ内順位とは別に、MR 予選ページで表示専用の合算順位タブが動作することを確認する。
- **手順**:
  1. 28名 MR 予選を作成し、全予選試合にスコアを投入する
  2. MR 予選ページを開く
  3. `合算順位` / `Combined` タブが表示されていることを確認する
  4. タブをクリックし、テーブルに行データが表示されることを確認する
  5. `Failed to fetch` やエラー表示が出ていないことを確認する
  6. 順位列が昇順に並んでいることを確認する
- **期待結果**: MR の合算順位タブが全グループの参加者を表示し、順位列が昇順で描画される
- **スクリプト**: tc-mr.js TC-623

## TC-858: MR Top-24 決勝 Winners R1 敗者の Losers R1 反映 (issue #858/#888)
- **背景**: Top-24 から生成される16人決勝では Winners R1 の敗者が Losers R1 に落ちる。偶数側の Winners R1 敗者は Losers R1 の player2 スロットに入る必要がある。issue #888 の 409 conflict 再発を防ぐため、Top-24 playoff 生成前に `mrQualificationConfirmed` を解除し、MR finals を `reset` してから再確定する。
- **手順**:
  1. 28名予選完了済みフィクスチャで `mrQualificationConfirmed` を false に戻す
  2. MR finals API に `{ reset: true }` を送信し、既存の playoff/finals 状態を空にする
  3. `mrQualificationConfirmed` を true に戻し、MR Top-24 playoff を生成する
  4. playoff_r1/playoff_r2 を完了し、16人決勝ブラケットを生成する
  5. Winners R1 M2 を player1 勝利で完了する
  6. Losers R1 M16 の `player2Id` が Winners R1 M2 の敗者になっていることを確認
- **期待結果**: Winners R1 M2 の敗者が M16 `player2Id` に反映され、`player1Id` を上書きしない
- **スクリプト**: tc-mr.js TC-858。定期一括実行では `tc-all.js` が MR suite を読み込み、`tc-mr.js` の登録済み TC-858 を実行対象にする

## TC-1072: 16人決勝 LR2 ペアリング検証の単純化 (issue #1072)
- **背景**: 16人決勝の Losers R2 ペアリング検証は、テスト内で参加者ラベルを再構成せず、ブラケット定義が持つ `loserGoesTo` を直接確認する。これにより #1071 で決めた B3/A4/A3/B4 順の保証を、余計なテスト側変換ロジックなしで読み取れるようにする。
- **手順**:
  1. 16人決勝ブラケットを生成する
  2. Winners QF M9-M12 を上から順に取得する
  3. 各 match の `loserGoesTo` を直接読み取る
  4. Losers R2 M23/M22/M21/M20 へ逆順に落ちることを確認する
- **期待結果**: Winners QF の `loserGoesTo` は `[23, 22, 21, 20]` で、テストは LR2 ラベル変換用の辞書化や探索処理を使わずに意図を検証する
- **スクリプト**: smkc-score-app/__tests__/e2e/tc-1073-16p-lr2-slots.test.ts

## TC-1073: 16人決勝 Winners QF 敗者の Losers R2 1P 反映 (issue #1073)
- **背景**: 16人決勝ブラケットでは、Winners QF から Losers R2 に落ちる敗者を 1P、Losers R1 から勝ち上がる選手を 2P に揃える必要がある。Losers R2 の対戦相手順は #1071 の B3/A4/A3/B4 順を維持する。
- **手順**:
  1. 16人決勝ブラケットを生成する
  2. Winners QF M9-M12 の敗者ルーティングを取得する
  3. Losers R1 M16-M19 の勝者ルーティングを取得する
  4. Losers R2 M20-M23 で Winners QF 敗者が `player1`、Losers R1 勝者が `player2` に入ることを確認する
- **期待結果**: M12→M20、M11→M21、M10→M22、M9→M23 の Winners QF 敗者がすべて 1P に入り、M16-M19 の Losers R1 勝者が対応する Losers R2 の 2P に入る
- **スクリプト**: smkc-score-app/__tests__/e2e/tc-1073-16p-lr2-slots.test.ts

## TC-1534-1535: 16人決勝 LR2 ルーティング follow-up 検証 (issues #1534, #1535, #1537)
- **背景**: TC-1072/TC-1073 の LR2 検証は、ドキュメント文言に含まれる単語ではなく、実際のテスト本体が補助的な変換・探索ロジックを持たないことと、QF 敗者・LR1 勝者の両ルートを完全な source/target オブジェクトで直接読むことを保証する。
- **手順**:
  1. 16人決勝ブラケットを生成する
  2. Winners QF M9-M12 の `loserGoesTo` と `loserPosition` を確認する
  3. Losers R1 M16-M19 の `winnerGoesTo` と `position` を確認する
  4. static drift test で LR2 検証ファイルに補助的な変換・探索呼び出しが混入していないことを確認する
- **期待結果**: Winners QF 側は M23/M22/M21/M20 の 1P、Losers R1 側は M20/M21/M22/M23 の 2P に直接ルーティングされ、テスト本体は重複した単純配列チェックを持たずにルーティング値を直接検証する
- **スクリプト**: smkc-score-app/__tests__/e2e/tc-1073-16p-lr2-slots.test.ts

## TC-1396: 16人決勝 QF 敗者スロット定義の一元化 (issue #1396)
- **背景**: TC-1073 の 16人決勝 QF 敗者スロットは、進行ロジック・API・ブラケット表示で同じ `BracketMatch.loserPosition` を参照し、個別の `loserPosition=1` ハードコードを増やさない
- **手順**:
  1. 16人決勝ブラケットを生成する
  2. Winners QF M9-M12 の `loserGoesTo` と `loserPosition` を確認する
  3. Losers R1 M16-M19 の winner `position` と比較する
  4. API 進行処理が `BracketMatch.loserPosition` に従って敗者スロットを更新することを確認する
- **期待結果**: QF 敗者はブラケットデータ上で M23/M22/M21/M20 の `loserPosition: 1` として定義され、API/表示側はそのフィールドを参照する
- **スクリプト**: smkc-score-app/__tests__/e2e/tc-1073-16p-lr2-slots.test.ts

## TC-1398-1399: BracketMatch 型と loserPosition fallback の一貫性 (issues #1398, #1399)
- **背景**: 決勝ブラケット表示・進行ロジック・API が同じ `BracketMatch` 契約を使い、`loserPosition` の未指定時 fallback を `?? 1` に統一することで、型更新時の二重定義漏れと routing 意図の不一致を防ぐ。
- **手順**:
  1. `double-elimination-bracket.tsx` がローカル `BracketMatch` を再定義していないことを確認する
  2. コンポーネントの `bracketStructure` が `@/types/bracket` の `BracketMatch` を参照することを確認する
  3. `double-elimination.ts` と `finals-route.ts` の敗者 routing fallback が `loserPosition ?? 1` で統一されていることを確認する
  4. 16人決勝 QF 敗者 routing の既存 E2E/単体カバレッジと合わせて、表示・API・進行ロジックが同じ `loserPosition` 契約を参照していることを確認する
- **期待結果**: `BracketMatch` は `src/types/bracket.ts` だけで管理され、敗者 routing は全経路で nullish fallback に統一される
- **スクリプト**: smkc-score-app/__tests__/e2e/tc-1398-1399-bracket-contract.test.ts

## TC-611: BM/MR/GP予選確定 — スコアロック検証
- **URL**: /api/tournaments/[temp-id]/mr (PUT), /api/tournaments/[temp-id]/mr/match/[matchId]/report (POST)
- **authRequired**: true (admin)
- **背景**: 予選確定後はスコア入力・編集・プレイヤー報告が全てロックされる
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー2名を作成する
  2. MR予選グループ設定でpendingマッチを生成する
  3. スコアを1試合入力し成功（200）を確認する
  4. Tournament PUT APIで `qualificationConfirmed: true` を送信する
  5. 同じマッチにスコア更新PUTを送信 → 403 (QUALIFICATION_CONFIRMED) を確認する
  6. プレイヤー報告POSTを送信 → 403 を確認する
  7. Tournament PUT APIで `qualificationConfirmed: false` に戻す（ロック解除）
  8. スコア更新PUTが再び成功（200）することを確認する
  9. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: 予選確定中はスコア操作が403で拒否され、解除後は再び編集可能になる

## TC-612: GPレース同順位バリデーション
- **URL**: /api/tournaments/[temp-id]/gp (PUT)
- **authRequired**: true (admin)
- **背景**: SMK 2人GPでは同じレースで両プレイヤーが同じ順位になることはない。ただし両者ゲームオーバー（position 0）は§7.2により許可
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー2名を作成する
  2. GP予選グループ設定でマッチを生成する
  3. 同順位（position1=2, position2=2）を含むレースデータでPUT → 400で拒否されることを確認する
  4. 両者ゲームオーバー（position1=0, position2=0）を含むレースデータでPUT → 200で受理されることを確認する
  5. 正常データ（全レースで異なる順位）でPUT → 200で受理されることを確認する
  6. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: 同順位レースは拒否され、両者ゲームオーバーと正常データは受理される

---

## GP (Grand Prix) フルワークフローテスト

### 設計方針
- BM/MR と対称に構成。GP 固有: 1試合 = 5レース（カップ単位）、各レースで position 1〜8 を入力 →
  driver points (1st=9, 2nd=6, 3rd=3, 4th=1, 5th〜=0) に換算
- **予選プレイヤー数**: 28名（4グループ × 7名）
- **予選試合数**: 7名RR × 4 = 84試合。各試合は 5 races の `{ course, position1, position2 }` 配列で送信
- **決勝**: 上位8名でダブルイリミネーション (17試合)。各試合は API PUT `{ score1, score2 }` で
  `points1/points2` を直接指定。`targetWins=3` のため score1 >= 3 XOR score2 >= 3 が必要
- 単発の participant テスト (TC-702/707/708) は 2 名のみで設置

## TC-701: GP予選フルフロー（28名、シード、4グループ）
- **URL**: /tournaments/[temp-id]/gp
- **authRequired**: true (admin)
- **手順**:
  1. 管理者セッションで一時トーナメントと28名のプレイヤーを作成
  2. GP予選グループ設定APIで28名をシード1〜28で登録、4グループ × 7 名に snake-draft で振り分け
  3. APIレスポンスで各グループに7名が割り当てられていること
  4. 各試合（合計84試合）について、5レース分の `races: [{ course, position1, position2 }]` を
     管理者 PUT (`{ matchId, cup, races }`) で投入し completed にする
  5. 順位表で driver points DESC → match score DESC でソートされていること
  6. クリーンアップ
- **期待結果**: 28名4グループのGP予選がシード・自動振り分け・driver points換算で正しく集計される

## TC-702: GPプレイヤーログインからドライバーズポイント合計送信
- **URL**: /auth/signin -> /tournaments/[temp-id]/gp/participant
- **authRequired**: true (player)
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー2名を作成（`dualReportEnabled=false`）
  2. GP予選グループ設定で2名のpendingマッチを生成（カップ自動割当付き）
  3. 別の一時ブラウザでP1としてログインし `/api/.../gp/match/:id/report` に
     `{ reportingPlayer: 1, points1: 45, points2: 0 }` を POST
  4. レスポンスに `autoConfirmed: true` が含まれること（`dualReportEnabled=false` のため即時確定）
  5. 管理者APIでマッチが completed、`points1=45, points2=0` で保存されていること
  6. issue #1099/#1437: driver points 直接入力時の `player1ReportedRaces` は `Prisma.JsonNull` として保存され、API 再取得では `null` として返ることを確認する
  7. クリーンアップ
- **期待結果**: GP participant 入力でdriver points合計送信→永続化が動作し、race breakdown がない直接入力は Prisma の JsonNull sentinel として扱われる
- **スクリプト**: e2e/tc-gp.js TC-702

## TC-1098: GPドライバーズポイント上限を共有定数で参照する
- **URL**: n/a (source guard)
- **authRequired**: false
- **背景**: GP participant 入力と report API がそれぞれ `MAX_GP_DRIVER_POINTS = 45` を定義すると、GPレース数やポイント配点の変更時に片方だけ更新されるリスクがある。
- **手順**:
  1. `src/lib/constants.ts` が `MAX_GP_DRIVER_POINTS` をエクスポートしていることを確認する
  2. `gp/participant/page.tsx` が `@/lib/constants` から `MAX_GP_DRIVER_POINTS` を import していることを確認する
  3. `gp/match/[matchId]/report/route.ts` が `@/lib/constants` から `MAX_GP_DRIVER_POINTS` を import していることを確認する
  4. participant page と API route に `const MAX_GP_DRIVER_POINTS = 45` のような page-local / route-local 定義が残っていないことを確認する
- **期待結果**: GPドライバーズポイント上限は UI/API とも共有定数を参照し、上限変更時の drift を起こさない
- **スクリプト**: tc-gp.js TC-1098

## TC-1106: GP手入力ドライバーズポイントは整数かつ上限内だけ受け付ける
- **URL**: n/a (source guard)
- **authRequired**: false
- **背景**: GP予選とGP決勝の管理者向け手入力欄はモバイル数値キーボードのため `type="text"` を使うため、HTMLの `min` / `max` / `step` だけに頼れない。UI側でも `0..MAX_GP_DRIVER_POINTS` の整数制約を共有ヘルパーで保つ必要がある。
- **手順**:
  1. `src/lib/gp-driver-points-input.ts` が `MAX_GP_DRIVER_POINTS` を参照し、`parseGpDriverPointsInput` をエクスポートしていることを確認する
  2. `gp/page-client.tsx` の管理者手入力保存・配信反映が `parseGpDriverPointsInput` を使うことを確認する
  3. `gp/finals/page.tsx` のカップ単位手入力が `parseGpDriverPointsInput` を使うことを確認する
  4. 共通入力propsが `type="text"` / `inputMode="numeric"` / `pattern="[0-9]*"` を維持していることを確認する
- **期待結果**: GPの手入力ドライバーズポイントは小数・負数・上限超過をUI側で拒否し、ブラウザ制約の有無で挙動がdriftしない
- **スクリプト**: tc-gp.js TC-1106

## TC-729: GP奇数人数BREAK — ソロ走行ドライバーズポイント入力
- **URL**: /tournaments/[temp-id]/gp
- **authRequired**: true (admin)
- **背景**: GP予選の奇数人数グループでは、BREAK相手の試合はBM/MRの不戦勝とは異なり、1人でカップを走って実際のドライバーズポイントをスコアとして記録する
- **手順**:
  1. 管理者セッションで一時トーナメントとGPプレイヤー3名を作成する
  2. GP予選グループ設定で3名を同一グループに登録し、BREAK試合を生成する
  3. BREAK試合が未完了で、GPカップが割り当てられていることを確認する
  4. BREAK試合へ `{ matchId, cup, races }` をPUTし、P1の順位のみからドライバーズポイントを計算できることを確認する
  5. API再取得でBREAK試合が completed、`points1` が実走ドライバーズポイント、`points2=0` として保存されていることを確認する
  6. クリーンアップ
- **期待結果**: GPのBREAKは自動45-0ではなく、ソロ走行の実ドライバーズポイントで順位表に反映される
- **スクリプト**: tc-gp.js TC-729

## TC-703: GP予選28名フル + 決勝ブラケット生成・1試合スコア入力
- **URL**: /tournaments/[temp-id]/gp/finals
- **authRequired**: true (admin)
- **手順**:
  1. 28名予選 + 全予選マッチ完了（TC-701同様）
  2. `POST /api/.../gp/finals { topN: 8 }` でブラケット生成（17試合）
  3. M1 に対象ラウンドのカップ勝利数（FT2なら `{ score1: 2, score2: 0 }`）で API PUT → 200 受理
  4. 勝者→M5、敗者→M8 にルーティングされること
  5. クリーンアップ
- **期待結果**: 28名予選→上位8名→GP決勝ブラケット生成・スコア入力・進行が正常動作

## TC-704: GP決勝ブラケットリセット（28名予選後）
- **URL**: /tournaments/[temp-id]/gp/finals
- **authRequired**: true (admin)
- **手順**:
  1. TC-703と同様にブラケット生成 → M1 に対象ラウンドのカップ勝利数を入力
  2. ブラケット生成 API を再 POST（=「Reset Bracket」UI 動作と同等）
  3. 全 17 マッチが pending 状態に戻ること
  4. クリーンアップ
- **期待結果**: ブラケットリセットで全マッチが未完了状態に戻る

## TC-705: GP Grand Final → チャンピオン決定（28名予選後）
- **URL**: /tournaments/[temp-id]/gp/finals
- **authRequired**: true (admin)
- **手順**:
  1. 28名予選 + 決勝ブラケット生成
  2. M1〜M16 を P1 が各ラウンドのFTカップ勝利数で勝つように API 連続入力
  3. M16 (Grand Final) で Winners 側勝者 (P1) が FT3 のカップ勝利数で勝つ
  4. `/gp/finals` ページの `body.innerText` にチャンピオンの nickname と "Champion/チャンピオン/優勝" が含まれること
  5. クリーンアップ
- **期待結果**: 全マッチ完了後にチャンピオンが正しく決定・表示される

## TC-706: GP Grand Final Reset Match（28名予選後）
- **URL**: /tournaments/[temp-id]/gp/finals
- **authRequired**: true (admin)
- **背景**: Grand Final で Losers 側が勝った場合、Reset Match (M17) が発生する
- **手順**:
  1. TC-705 同様に M1〜M15 を P1 が各ラウンドのFTカップ勝利数で勝つように消化
  2. M16 で L-side 勝者 (P2) が FT3 のカップ勝利数で勝つようにスコア入力
  3. M17 が出現し両プレイヤーが populate されること
  4. M17 にスコア入力（L-side 勝者を勝たせる）→ completed
  5. クリーンアップ
- **期待結果**: Grand Final Reset が正しくトリガーされ、最終勝者がチャンピオンとなる

## TC-707: GP二重報告 — 双方一致で自動確定
- **URL**: /tournaments/[temp-id]/gp/participant
- **authRequired**: true (player × 2)
- **手順**:
  1. `dualReportEnabled=true` のトーナメントとプレイヤー2名を作成
  2. GPグループ設定でpendingマッチを生成
  3. P1 が `races=[各レース position1=1, position2=5]` を送信 → `waitingFor: player2`
  4. P2 が同じ `races` を送信 → `autoConfirmed: true` で confirmed
  5. 管理者APIでマッチが completed、`points1=45, points2=0`
  6. クリーンアップ
- **期待結果**: 双方一致で GP マッチが自動確定される

## TC-708: GP二重報告 — 不一致でmismatch検出
- **URL**: /tournaments/[temp-id]/gp/participant
- **authRequired**: true (player × 2)
- **手順**:
  1. `dualReportEnabled=true` のトーナメントとプレイヤー2名を作成
  2. GPグループ設定でpendingマッチを生成
  3. P1 が race position 1-vs-5 で送信、P2 が race position 5-vs-1 で送信（不一致）
  4. レスポンスに `mismatch: true` が含まれ、マッチは completed=false のまま
  5. 管理者 PUT (`{ matchId, cup, races }`) で確定 → completed=true
  6. 管理者PUTレスポンスの `match` は `player1Id/player2Id` を含み、不要な `player1/player2` 展開を含まないことを確認する
  7. クリーンアップ
- **期待結果**: 不一致時はマッチが未完了のまま管理者レビュー待ちになる

## TC-1015: participant report success message branch coverage
- **URL**: /tournaments/[temp-id]/bm/participant, /tournaments/[temp-id]/mr/participant, /tournaments/[temp-id]/gp/participant
- **authRequired**: true (player)
- **背景**: issue #1015/#1016/#1571。参加者側の報告完了メッセージは API の `mismatch`/`corrected`/`autoConfirmed`/`waitingFor` フラグで分岐するため、dual-report の不一致や修正送信時に汎用成功文へ落ちないことを固定する。
- **手順**:
  1. BM/MR/GP の既存 dual-report E2E (TC-508, TC-609, TC-708) で `mismatch: true` レスポンスが返ることを確認する
  2. participant success-message helper の単体テストで score report の `mismatch: true` が mismatch 文言を返すことを確認する
  3. participant success-message helper の単体テストで score report の `corrected: true` が correction 文言を返すことを確認する
  4. participant success-message helper の単体テストで match report の `mismatch: true` が mismatch 文言を返すことを確認する
  5. `ParticipantReportResult` の型が API レスポンス実態に合わせて boolean/string に厳密化され、静的ガードが unit test の説明文ではなく関数呼び出しシグネチャを確認することを検証する
- **期待結果**: mismatch/corrected 分岐が UI helper と型定義の両方で保護され、参加者側の完了通知が API 状態に一致する
- **スクリプト**: `smkc-score-app/__tests__/static/tc-1015-participant-report-message.test.ts`, `smkc-score-app/__tests__/lib/participant-report-message.test.ts`

## TC-709: GP決勝 — 非管理者のスコア入力拒否
- **URL**: /api/tournaments/[temp-id]/gp/finals (PUT)
- **authRequired**: true (player — 管理者ではない)
- **背景**: 決勝は putRequiresAuth: true で管理者のみ
- **手順**:
  1. 28名予選 + 決勝ブラケット生成
  2. 一般プレイヤーとしてログインし、決勝APIにPUT
  3. HTTP 403 Forbidden が返ること
  4. クリーンアップ
- **期待結果**: GP 決勝スコア入力は管理者のみ許可、プレイヤーは 403 拒否

## TC-720: GP決勝 — FT2 は2カップ先取で決着
- **URL**: /api/tournaments/[temp-id]/gp/finals (PUT)
- **authRequired**: true (admin)
- **背景**: GP決勝のFTはドライバーズポイント合計ではなく、カップ勝利数の先取数。通常のUpper/Lower序盤ラウンドはFT2。
- **手順**:
  1. 28名予選 + Top-8 GP決勝ブラケット生成
  2. M1 に1カップ分だけP1勝利の `cupResults` をPUTする
  3. M1 は `points1=1, points2=0, completed=false` のままで、M5/M8へルーティングされないこと
  4. M1 に2カップ分のP1勝利をPUTする
  5. M1 は `points1=2, points2=0, completed=true` になり、勝者/敗者が次マッチへルーティングされること
- **期待結果**: GP決勝FT2では1カップ勝利で試合が終わらず、2カップ先取で初めて完了する
- **スクリプト**: tc-gp.js TC-720

## TC-832: GP決勝 — `cupResults` の過大配列を拒否
- **URL**: /api/tournaments/[temp-id]/gp/finals (PUT)
- **authRequired**: true (admin)
- **背景**: GP決勝の `cupResults` は通常FT2/FT3の数カップだけを保持する。過大な配列は不要な処理負荷になるため、APIで上限を持つ。
- **手順**:
  1. 28名予選 + Top-8 GP決勝ブラケット生成
  2. M1 に21件の `cupResults` をPUTする
  3. HTTP 400 と `cupResults must not exceed 20 entries` が返ること
  4. M1 を再取得し、`points1=0`、`points2=0`、`completed=false` のまま変更されていないこと
- **期待結果**: GP決勝APIは21件以上の `cupResults` を拒否し、マッチ状態を更新しない
- **スクリプト**: tc-gp.js TC-832

## TC-830: GP決勝 — 旧サドンデス勝者つき同点完了行を勝者表示できる
- **URL**: /tournaments/[temp-id]/gp/finals
- **authRequired**: true (admin)
- **背景**: issue #830。旧仕様ではGP決勝の同点マッチを `suddenDeathWinnerId` で決着していた。現在の `cupResults` 方式へ移行後も、過去に完了済みの同点行は破壊的なデータ移行なしでブラケット勝者とチャンピオン表示を維持する必要がある。
- **手順**:
  1. GP決勝ページの勝者判定が専用ヘルパーを使っていることを確認する
  2. GP決勝ページがブラケットコンポーネントへ同じ勝者判定を渡すことを確認する
  3. ヘルパーが `points1 === points2` の完了済み行で `suddenDeathWinnerId` を参照することを確認する
  4. `suddenDeathWinnerId` が player1/player2 のどちらにも一致しない場合は勝者なしになることを確認する
  5. 新仕様の通常行では `points1/points2` のカップ勝数で勝者判定されることを確認する
- **期待結果**: 新仕様のカップ勝数表示を保ちつつ、旧サドンデス決着済みデータでも勝者表示が欠落しない
- **スクリプト**: `__tests__/app/tournaments/gp-finals-page-wiring.test.tsx` / `__tests__/lib/gp-finals-match-winner.test.ts` / `__tests__/components/tournament/double-elimination-bracket.test.tsx` / `__tests__/components/tournament/playoff-bracket.test.tsx`

## TC-831: GP決勝 — 上位ブラケットはカップ勝数のシンプル入力で保存できる
- **URL**: /tournaments/[temp-id]/gp/finals
- **authRequired**: true (admin)
- **背景**: GP上位ブラケット決勝はカップ別レース詳細ではなく、勝利カップ数だけを保存する。旧カップフォームが残ると、不要な `cupResults` や古い詳細スコアが payload に混入する。
- **手順**:
  1. 28名予選 + Top-8 GP決勝ブラケット生成
  2. 管理者として GP決勝ページを開き、M1 のスコア入力ダイアログを開く
  3. `gp-finals-simple-score1/2` の数値入力と FT2 表示があることを確認
  4. 旧 `gp-finals-cup-form-*` と `Add Cup` が表示されないことを確認
  5. `2-0` を入力して保存する
- **期待結果**: 保存後の M1 は `points1=2`、`points2=0`、`completed=true` になり、`cupResults` は保存されない
- **スクリプト**: tc-gp.js TC-831

## TC-721: GP決勝 — 同点カップはサドンデスではなく次カップへ進む
- **URL**: /api/tournaments/[temp-id]/gp/finals (PUT)
- **authRequired**: true (admin)
- **背景**: GPではドライバーズポイントが同点のカップは勝敗を付けず、次のカップを行って決着する。
- **手順**:
  1. 28名予選 + Top-8 GP決勝ブラケット生成
  2. M1 に1カップ目 `36-36`、2カップ目P1勝利の `cupResults` をPUTする
  3. サドンデス指定なしで200が返り、M1は `points1=1, points2=0, completed=false`
  4. 3カップ目P1勝利を追加してPUTする
  5. M1は `points1=2, points2=0, completed=true` になり、`cupResults` は3件保持されること
- **期待結果**: 同点カップは誰にもカップ勝利を与えず、必要ならFT数を超えた追加カップで決着する
- **スクリプト**: tc-gp.js TC-721

## TC-722: GP 決勝 — Winners SF はFT2、決勝帯はFT3
- **URL**: /api/tournaments/[temp-id]/gp/finals (PUT)
- **authRequired**: true (admin)
- **背景**: GPのWinners Semi FinalはFT2で完了する。Winners Final / Losers Semi Final / Losers Final / Grand Final はFT3で、2カップ勝利では未完了、3カップ先取が必要。ベスト4以前のダブルイリミネーション試合もFT2、BarragesはFT1。
- **手順**:
  1. 28名予選 + Top-8 GP決勝ブラケット生成
  2. M1-M15 は E2E 側でFT数を再計算せず、`assignedCups` を1件ずつ追加PUTし、PUTレスポンスの更新済みmatchで `completed=true` を確認できた時点で次試合へ進める
     - レガシーデータなどで `assignedCups` がない場合のE2Eフォールバックは、FT3の最大3勝に対応する3カップまでに限定する
  3. Winners Final (M16) に2カップ分のP1勝利をPUTし、`points1=2, completed=false` であることを確認する
  4. Winners Final (M16) に3カップ目P1勝利を追加してPUTし、`points1=3, completed=true` になることを確認する
  5. Winners Semi Final 群は `points1=2, completed=true` で完了済みであることを確認する
- **期待結果**: GP Winners Semi Final はFT2として完了し、Winners Final / Losers Semi Final / Losers Final / Grand Final はFT3として動作する
- **スクリプト**: tc-gp.js TC-722

## TC-723: GP 予選順位表 — 0-1000 予選点列の表示
- **URL**: /tournaments/[temp-id]/gp
- **authRequired**: true (admin)
- **背景**: GP 予選順位表の `得点` はドライバーズポイントであり、総合ランキング用の最大1000点換算とは別である。予選点列を別表示し、ドライバーズポイントと混同しないようにする。
- **手順**:
  1. 28名 GP 予選を作成し、全予選試合にスコアを投入する
  2. GP 予選順位表を開く
  3. `予選点` / `Qual Pts` 列が表示され、ヘッダーの title に 0-1000 正規化の説明があることを確認する
  4. 同列の各行が整数で、0〜1000 の範囲に収まることを確認する
- **期待結果**: スコア入力後の GP 順位表に予選点列と説明 title が表示され、少なくとも1行が0より大きい 0〜1000 点の値を持つ
- **スクリプト**: tc-gp.js TC-701 内で検証

## TC-724: GP 予選順位表 — 合算順位タブの表示と点数列ヘッダー
- **URL**: /tournaments/[temp-id]/gp
- **authRequired**: true (admin)
- **背景**: GP 予選は複数グループで進行するため、グループ別順位に加えて全グループを横断した確認用ランキングが必要。GP ではドライバーズポイントを主キー、勝点を副キーにした表示専用の合算順位タブが動作することを確認する。
- **手順**:
  1. 28名 GP 予選を作成し、全予選試合にスコアを投入する
  2. GP 予選ページを開く
  3. `合算順位` / `Combined` タブが表示されていることを確認する
  4. タブをクリックし、テーブルに行データが表示されることを確認する
  5. `Failed to fetch` やエラー表示が出ていないことを確認する
  6. 順位列が昇順に並んでいることを確認する
  7. ヘッダーに `勝点` / `Match Pts` と `ドライバー点` / `Driver Pts` が表示されることを確認する
- **期待結果**: GP の合算順位タブが全グループの参加者を表示し、順位列が昇順で描画され、勝点列とドライバー点列を区別できる
- **スクリプト**: tc-gp.js TC-724

## TC-728: GP 予選順位基準 — サーバーとクライアントが同じ score→points 定義を使う
- **URL**: n/a (unit coverage)
- **authRequired**: false
- **背景**: GP 予選順位は勝点 (`score`) を主キー、ドライバーズポイント (`points`) を副キーにする。DB orderBy とクライアント comparator が別々に定義されると、将来の仕様変更時に finals・standings・ページ表示のどれかが更新漏れになる。
- **手順**:
  1. `src/lib/gp-ranking.ts` の共有 orderBy/comparator を確認する
  2. GP config、GP finals route、GP standings route が共有 orderBy helper を参照していることを確認する
  3. GP page-client のグループ別順位と合算順位が共有 comparator を参照していることを確認する
  4. comparator が `score` を `points` より優先して並べることを単体テストで確認する
- **期待結果**: GP のサーバー取得順とクライアント表示順が単一の共有定義から決まり、`score → points` の優先順位が全経路で一致する
- **スクリプト**: smkc-score-app/__tests__/lib/gp-ranking.test.ts

## TC-725: GP 予選カップ割り当て — ラウンド境界で同じカップが連続しない
- **URL**: /api/tournaments/[temp-id]/gp (GET)
- **authRequired**: true (admin)
- **背景**: GP 予選のカップ割り当ては4カップのシャッフル済みデッキを5回つなげて作る。デッキ境界で前ラウンドと同じカップから始まる場合は、ランダムに選んだ非重複カップと先頭をスワップし、通常設定では隣接ラウンドが同じカップにならない。将来カップリストが1種類などに変わった場合はこの制約を満たせないため、サーバー側は警告を出して防御的に検知する。
- **手順**:
  1. 共有 GP フィクスチャと同じ構成で GP 予選を作成する
  2. `GET /api/.../gp` で予選マッチ一覧を取得する
  3. BYE を除いた各 `roundNumber` のマッチが同じ `cup` を持つことを確認する
  4. `roundNumber` 昇順で隣接ラウンドの `cup` が重複しないことを確認する
- **期待結果**: 通常GP設定では同一ラウンド内のカップが揃い、隣接ラウンドで同じカップが連続しない。デッキ境界補正のランダムスワップ方式と単一カップ設定の防御警告は `qualification-route.test.ts` でカバーする
- **スクリプト**: tc-gp.js TC-725

## TC-1087: GP 予選カップ割り当て — roundNumber は正の1始まりだけを使う
- **URL**: /api/tournaments/[temp-id]/gp (GET)
- **authRequired**: true (admin)
- **背景**: GP 予選カップ選択は `(roundNumber - 1) % deck.length` でシャッフル済みデッキを参照する。`roundNumber <= 0` や `NaN` / `Infinity` が混入すると `undefined` cup が割り当たるため、API 生成結果と単体ガードの両方で有限な正の1始まり整数を保証する。
- **手順**:
  1. 共有 GP フィクスチャと同じ構成で GP 予選を作成する
  2. `GET /api/.../gp` で予選マッチ一覧を取得する
  3. BYE を除いた全マッチの `roundNumber` が有限な正の整数であることを確認する
  4. 同じ全マッチに `cup` が割り当たっていることを確認する
- **期待結果**: E2E の GP 予選生成経路は有限な `roundNumber >= 1` のみを返し、`0` / `-1` / `1.5` / `NaN` / `Infinity` 入力時の例外は `qualification-route.test.ts` でカバーする
- **スクリプト**: tc-gp.js TC-1087

## TC-1088: GP 予選単体テスト — 4人ラウンドロビンの3ラウンド前提を明記する
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #1088。`qualification-route.test.ts` の `matchesByRound.size === 3` は、4人ラウンドロビンでは各プレイヤーが3ラウンド走るという組み合わせ前提を表す。コメントなしでは単なるマジックナンバーに見えるため、テスト内で前提を明示する。
- **手順**:
  1. `qualification-route.test.ts` の GP 予選同一ラウンド cup テストを確認する
  2. `matchesByRound.size` の直前に4人ラウンドロビンの3ラウンド前提コメントがあることを確認する
  3. コメントが `C(4,2)/2` の組み合わせ根拠を含むことを確認する
- **期待結果**: 4人 GP 予選で3ラウンドになる理由が単体テスト上で読み取れ、将来の fixture 変更時に前提の更新漏れを検知できる
- **スクリプト**: smkc-score-app/__tests__/static/tc-1088-qualification-route-comment.test.ts

## TC-1007: BM/MR/GP グループ設定 — 未使用 groupCount prop を親から渡さない
- **背景**: issue #1007。`GroupSetupDialog` は内部の `LOCKED_GROUP_COUNT` で2グループ固定を管理しており、親ページから渡す `groupCount` は読み取られない。未使用 prop を残すと、3+グループ再開時に親状態が効くように見える誤解を生む。
- **手順**:
  1. TC-1007 の静的 E2E guard を実行する
  2. `GroupSetupDialogProps` と BM/MR/GP の `<GroupSetupDialog>` 呼び出しを検査する
  3. 親ページが読み取り側の `groupCount` state を保持していないことを確認する
- **期待結果**:
  - `GroupSetupDialogProps` に `groupCount: number` が存在しない
  - BM/MR/GP の呼び出し元が `groupCount={groupCount}` を渡さない
  - 2グループ固定の理由は `GroupSetupDialog` 内の `LOCKED_GROUP_COUNT` とコメントに集約される
- **スクリプト**: `npm test -- --runTestsByPath __tests__/static/tc-1007-group-setup-dialog-prop-contract.test.ts`

## TC-1004: TA コースサイクル — 未使用 availableCount フィールドを公開しない
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #1004。TA のコースサイクル表示は `availableCourses.length` を画面に出しており、`CourseCycleStatus.availableCount` は UI で参照されない。未使用フィールドを返すと将来の表示契約が増えたように見え、サーバー側の利用可能コース計算と二重管理になる。
- **手順**:
  1. TC-1004 の静的 E2E guard を実行する
  2. `CourseCycleStatus` の公開フィールドを検査する
  3. TA Finals と TA elimination のコースサイクル表示が `availableCourses.length` を `CourseCycleStatusPanel` の `availableCoursesCount` に渡すことを確認する
  4. `getCourseCycleStatus` の単体テストを実行し、cycle/played/total/totalPlayed のみが返ることを確認する
- **期待結果**:
  - `CourseCycleStatus` に `availableCount` が存在しない
  - `getCourseCycleStatus` は UI が実際に使う cycle/played/total/totalPlayed だけを返す
  - 利用可能コース数の表示は `availableCourses.length` から渡され、重複した派生値を持たない
- **スクリプト**: `npm test -- --runTestsByPath __tests__/static/tc-1004-course-cycle-status-contract.test.ts __tests__/lib/ta/course-cycle-status.test.ts`

## TC-1005: TA コースサイクル — Finals/Elimination 表示を共有コンポーネントに集約
- **URL**: `/tournaments/{id}/ta/phase1`, `/tournaments/{id}/ta/finals`
- **authRequired**: true
- **背景**: issue #1005。TA Finals と TA elimination phases のコースサイクル表示は同じ `courseCycleLabel` / `availableCoursesLabel` / `courseCycleHint` UI 契約を持つため、表示ブロックを別々に持つと文言・算出元・スタイルの片側だけが変わるリスクがある。
- **手順**:
  1. TA Phase 1 用の隔離トーナメントを作成し、予選順位 17-24 の8名を Phase 1 に昇格する
  2. `/ta/phase1` にアクセスし、コースサイクルと利用可能コース数が表示されることを確認する
  3. TA Finals 用の隔離トーナメントを作成し、予選上位の選手を Phase 3 に昇格する
  4. `/ta/finals` にアクセスし、同じコースサイクル表示が出ることを確認する
  5. 静的 E2E guard と `CourseCycleStatusPanel` の単体テストで、TA Finals と TA elimination が `availableCourses.length` を `availableCoursesCount` に渡すことを確認する
- **期待結果**:
  - TA Finals と TA elimination のコースサイクル表示は同じ `CourseCycleStatusPanel` に集約される
  - `CourseCycleStatusPanel` は cycle/played/total/available/totalPlayed を表示する
  - 表示ロジックの重複が残らず、今後の文言・スタイル変更が1箇所で済む
- **スクリプト**: `E2E_TESTS=TC-1005 node e2e/tc-ta.js` + `npm test -- --runTestsByPath __tests__/static/tc-1005-course-cycle-panel-contract.test.ts __tests__/components/tournament/course-cycle-status-panel.test.tsx`

## TC-1678: BM/MR/GP グループ設定 — setGroupCount コールバックを親から渡さない
- **背景**: issue #1678。TC-1007 で `groupCount` prop は削除済みだが、`setGroupCount` コールバックと親の `useState(2)` が残ると、ダイアログの2グループ固定が親 state に依存しているように読める。
- **手順**:
  1. TC-1678 の静的 E2E guard を実行する
  2. `GroupSetupDialogProps` と BM/MR/GP の `<GroupSetupDialog>` 呼び出しを検査する
  3. 親ページに `const [, setGroupCount] = useState(2)` が残っていないことを確認する
- **期待結果**:
  - `GroupSetupDialogProps` に `setGroupCount` が存在しない
  - BM/MR/GP の呼び出し元が `setGroupCount={setGroupCount}` を渡さない
  - 2グループ固定は `GroupSetupDialog` 内の `LOCKED_GROUP_COUNT` と表示上の固定ボタンだけで完結する
- **スクリプト**: `npm test -- --runTestsByPath __tests__/static/tc-1007-group-setup-dialog-prop-contract.test.ts`

## TC-1680: BM/MR/GP グループ設定 — 固定グループ数表示を disabled にする
- **背景**: issue #1680。2グループ固定表示のボタンは `setGroupCount` 削除後にクリックしても何も起きないため、disabled 状態で固定値表示であることを明示する。
- **手順**:
  1. TC-1680 の静的 E2E guard を実行する
  2. `GroupSetupDialog` の `LOCKED_GROUP_COUNT` 表示ボタンを検査する
  3. ボタンに `disabled` があり、`onClick` がないことを確認する
- **期待結果**:
  - 固定グループ数の UI が押せる操作として誤認されない
  - `LOCKED_GROUP_COUNT = 2` の固定仕様は維持される
  - 将来 3+ グループ対応を戻す場合は guard 更新が必要になる
- **スクリプト**: `npm test -- --runTestsByPath __tests__/static/tc-1007-group-setup-dialog-prop-contract.test.ts`

## TC-1682: BM/MR/GP グループ設定 — disabled 固定グループ数を outline 表示にする
- **背景**: issue #1682。固定値の disabled ボタンが `variant="default"` のままだと、環境によってはアクティブな選択ボタンに見える可能性がある。`variant="outline"` にして情報表示寄りの見た目にする。
- **手順**:
  1. TC-1682 の静的 E2E guard を実行する
  2. `GroupSetupDialog` の `LOCKED_GROUP_COUNT` 表示ボタンを検査する
  3. ボタンが `variant="outline"` かつ `disabled` で、`onClick` がないことを確認する
- **期待結果**:
  - 固定グループ数表示がアクティブ操作に見えにくい
  - disabled と non-clickable の契約は維持される
  - 将来 selectable UI に戻す場合は guard 更新が必要になる
- **スクリプト**: `npm test -- --runTestsByPath __tests__/static/tc-1007-group-setup-dialog-prop-contract.test.ts`

## TC-1980-1982: BM/MR/GP グループ設定 — page.getByRole モックの期待値エイリアスを持たない
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #1980 / #1982。`group-setup-helper.test.ts` の `page.getByRole` モックで `EXPECTED_PAGE_ROLE_LOOKUPS` をローカル変数へ再代入すると、期待値の所在が増えてレビュー時にインデント崩れや不要な中間変数の指摘が再発する。
- **手順**:
  1. `group-setup-helper.test.ts` の `page.getByRole` unexpected branch を確認する
  2. `throwUnexpectedMockCall('page.getByRole', roleLookup(_role, name), EXPECTED_PAGE_ROLE_LOOKUPS)` の形で直接渡していることを確認する
  3. `const expectedPageRoleLookups` / `const actualPageRoleLookup` のローカルエイリアスが残っていないことを確認する
- **期待結果**:
  - `EXPECTED_PAGE_ROLE_LOOKUPS` が単一の期待値定義として使われる
  - unexpected selector のエラーメッセージは既存の許可リストを維持する
  - インデントだけを直す follow-up が再発しない
- **スクリプト**: `npm test -- --runTestsByPath __tests__/e2e/group-setup-helper.test.ts __tests__/docs/e2e-cases-drift.test.ts`

## TC-2012: BM/MR/GP グループ設定 — TC-1980-1982 guard を空白依存にしない
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #2012。TC-1980-1982 の静的 guard が `throwUnexpectedMockCall(...)` 呼び出し全体を正規表現で読むと、正当な改行・フォーマット変更だけで false positive になる。
- **手順**:
  1. TC-1980-1982 のドリフト guard を確認する
  2. `throwUnexpectedMockCall(` / `roleLookup(_role, name)` / `EXPECTED_PAGE_ROLE_LOOKUPS` の存在チェックで意図を確認する
  3. 呼び出し全体の空白配置を固定する `toMatch` 正規表現が残っていないことを確認する
- **期待結果**:
  - ローカルエイリアス禁止の意図は維持される
  - 正当なフォーマット変更では guard が落ちない
  - TC-1980-1982 の回帰検知は AST helper で同一呼び出しを確認する
- **スクリプト**: `npm test -- --runTestsByPath __tests__/docs/e2e-cases-drift.test.ts`

## TC-2014: BM/MR/GP グループ設定 — unexpected branch guard の引数共出現を保証する
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #2014。TC-2012 で guard を `toContain` に分割した結果、`throwUnexpectedMockCall(` / `roleLookup(_role, name)` / `EXPECTED_PAGE_ROLE_LOOKUPS` が別々の箇所に散在してもテストが通る可能性が残った。
- **手順**:
  1. TC-1980-1982 の `page.getByRole` unexpected branch guard を確認する
  2. TypeScript AST helper で `throwUnexpectedMockCall('page.getByRole', roleLookup(_role, name), EXPECTED_PAGE_ROLE_LOOKUPS)` が同一の `throwUnexpectedMockCall(...)` 呼び出しに揃っていることを確認する
  3. helper 自体が、必要な引数が別呼び出しに分散した fixture を拒否することを確認する
- **期待結果**:
  - `page.getByRole` unexpected branch は `EXPECTED_PAGE_ROLE_LOOKUPS` を直接渡す
  - 同一呼び出し内の共出現が崩れた場合は drift guard が落ちる
  - 正当な改行・インデント変更では guard が落ちない
- **スクリプト**: `npm test -- --runTestsByPath __tests__/docs/e2e-cases-drift.test.ts __tests__/helpers/e2e-cases.test.ts`

## TC-2136: finals-route.test.ts — 未使用 qualification helper を残さない
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #2136。`__tests__/lib/api-factories/finals-route.test.ts` の `_createMockQualification` は PR #2134 後に参照元がなくなった dead helper で、将来使うかもしれない前提で残すと実際の fixture contract とずれたテスト補助コードが残る。
- **手順**:
  1. `finals-route.test.ts` の共有 helper 群を確認する
  2. 実際に使われる `createMockMatch` と各 describe 内の `createMockQualifications` は残す
  3. 未使用の `_createMockQualification` が存在しないことを静的ガードで確認する
- **期待結果**:
  - finals route factory のテストから未使用 helper が削除されている
  - 使われている match/qualification fixture helper は維持される
  - `_createMockQualification` が戻った場合は TC-2136 guard が失敗する
- **スクリプト**: `npm test -- --runTestsByPath __tests__/static/tc-2136-finals-route-dead-helper.test.ts __tests__/docs/e2e-cases-drift.test.ts`

## TC-2139: GP E2E drift guard — TC-831/TC-832 負 fixture をコメント文面固定にしない
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #2139。TC-831/TC-832 の順序 rationale を守る負テストで、fixture 注入がコメント全文の完全一致に依存すると、コメントの typo 修正だけで注入が空振りし、原因の分かりにくい失敗になる。
- **手順**:
  1. `e2e-cases-drift.test.ts` の TC-831/TC-832 rationale guard を確認する
  2. 負 fixture 生成が rationale の完全一致文字列ではなく、既存の adjacency 正規表現を使っていることを確認する
  3. fixture 注入後に `weakenedFixture !== tcGp` を確認し、注入空振りを早期に検出する
  4. `group-setup-helper.test.ts` が suite spec 経由で TC-831 と TC-832 の隣接順を検証する
- **期待結果**:
  - コメント文面だけの安全な変更では負 fixture 注入が壊れない
  - rationale と TC-831/TC-832 の間に non-comment code が入ると drift guard が落ちる
  - fixture 注入が空振りした場合は専用アサーションで原因が分かる
- **スクリプト**: `npm test -- --runTestsByPath __tests__/docs/e2e-cases-drift.test.ts __tests__/e2e/group-setup-helper.test.ts`

## TC-2145: qualification-route.test.ts — 参照される mock match に未使用変数風の名前を使わない
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #2145。`__tests__/lib/api-factories/qualification-route.test.ts` の `should aggregate player stats` で参照される fixture が `_mockMatch` と命名され、未使用変数の慣習と衝突してレビュー時に誤読されやすい。
- **手順**:
  1. `qualification-route.test.ts` の player stats aggregation fixture を確認する
  2. `mockPlayer1Matches` / `mockPlayer2Matches` が `mockMatch` を参照していることを確認する
  3. `_mockMatch` が qualification route factory テストに残っていないことを静的ガードで確認する
- **期待結果**:
  - 参照される match fixture は `mockMatch` として読める
  - 未使用変数を示す `_mockMatch` が戻った場合は TC-2145 guard が失敗する
  - E2E scenario と guard test が同じ対象ファイルを指す
- **スクリプト**: `npm test -- --runTestsByPath __tests__/static/tc-2145-qualification-route-mock-match-name.test.ts __tests__/docs/e2e-cases-drift.test.ts __tests__/lib/api-factories/qualification-route.test.ts`

## TC-2143: tc-2136 static guard — it() 説明文を肯定形で保つ
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #2143。TC-2136 の `it()` 説明文が "does not keep ..." という否定形で、実際の期待結果である `_createMockQualification` の削除済み状態が読み取りにくかった。
- **手順**:
  1. `tc-2136-finals-route-dead-helper.test.ts` の `it()` 説明文を確認する
  2. 説明文が `_createMockQualification` helper の削除済み状態を肯定形で表していることを確認する
  3. 同じ static guard が `finals-route.test.ts` の使用中 helper と dead helper 不在を引き続き検証する
- **期待結果**:
  - TC-2136 guard の説明文は `has removed the unused _createMockQualification helper from finals-route.test.ts` と読める
  - 旧い否定形の `does not keep ...` 説明文が戻った場合は guard が失敗する
  - `_createMockQualification` が戻った場合は TC-2136 guard が引き続き失敗する
- **スクリプト**: `npm test -- --runTestsByPath __tests__/static/tc-2136-finals-route-dead-helper.test.ts __tests__/docs/e2e-cases-drift.test.ts`

## TC-2127: tc-all TC-939 registration guard — helper 呼び出しを実挙動で保護する
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #2127。`tc-all-registration.test.ts` の TC-939 guard が `require('./lib/tc939-reporting')` や旧 ternary 実装の改行込み文字列に依存すると、実動作を変えない import 整理やインデント変更で壊れやすい。
- **手順**:
  1. `tc-all-registration.test.ts` が `tc939-reporting` helper を実際に読み込み、reload と className failure の両方が同じ detail に出ることを確認する
  2. `tc-all.js` の TC-939 ブロックが `describeTc939TabNavigation({ spaMarker, cleanClasses })` 経由で結果を作ることを確認する
  3. 旧 inline ternary 実装の復活検知は改行・インデントに依存しない正規表現で確認する
- **期待結果**:
  - require パス文字列そのものではなく helper の実 import と出力 contract が検証される
  - TC-939 の複数 failure 理由は引き続き同じログ detail に残る
  - 旧 inline 実装が戻った場合は、整形差分に左右されず guard が失敗する
- **スクリプト**: `npm test -- --runTestsByPath __tests__/e2e/tc-all-registration.test.ts __tests__/docs/e2e-cases-drift.test.ts`

## TC-1009: 総合ランキング決勝順位 — 16人/Top-24 判定の matchNumber 閾値を明文化する
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #1009。`isSixteenPlayerOrTop24Bracket` は `generateBracketStructure(8)` と `generateBracketStructure(16)` の matchNumber 割り当て差分を使って、8人決勝ではなく16人決勝/Top-24経路の順位帯を選ぶ。閾値だけが残ると、ブラケット生成側の番号体系に依存していることが読めず、将来の構造変更で静かに壊れる。
- **手順**:
  1. `overall-ranking.ts` の `isSixteenPlayerOrTop24Bracket` を確認する
  2. `generateBracketStructure(8)` と `generateBracketStructure(16)` の番号差分がコメントで説明されていることを確認する
  3. losers_r1 / losers_r2 / losers_r3 / losers_sf / losers_final / grand_final / grand_final_reset の各閾値が 16人決勝側の matchNumber 範囲と対応していることを確認する
- **期待結果**: 16人決勝/Top-24 判定の matchNumber 閾値が、8人決勝との差分として読み取れ、静的テストでコメントの脱落を検知できる
- **スクリプト**: smkc-score-app/__tests__/static/tc-1009-overall-ranking-bracket-threshold-comments.test.ts

## TC-1669: TC-1009 静的ガード — losers_r4 のコメント行も検証する
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #1669。`losers_r4` は8人決勝に存在しないラウンドなので、`isSixteenPlayerOrTop24Bracket` では `matchNumber` 閾値なしで検出する。TC-1009のループ型アサーションは閾値付きラウンドだけを検証するため、`losers_r4: 26-27` のコメント行を別アサーションで保護する必要がある。
- **手順**:
  1. TC-1009 の静的テストを実行する
  2. `overall-ranking.ts` のコメントが `losers_r4: 26-27` を含むことを確認する
  3. `m.round === "losers_r4"` の即時判定が静的ガード対象に含まれることを確認する
- **期待結果**: `losers_r4` だけコメント保護から漏れず、16人決勝固有ラウンドの説明削除をCIで検出できる
- **スクリプト**: smkc-score-app/__tests__/static/tc-1009-overall-ranking-bracket-threshold-comments.test.ts

## TC-1671: docs drift 分類 — TC-1669 を番号順に並べる
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #1671。`e2e-cases-drift.test.ts` の static-only 分類配列で TC-1669 が TC-1528 より前にあると、後続の追加時に同じ順序崩れが混入しやすい。分類表は検索性のため、近接ブロック内でTC番号順を維持する。
- **手順**:
  1. `e2e-cases-drift.test.ts` の standalone browser runner 対象外分類を確認する
  2. TC-1451-1452 / TC-1454-1455 / TC-1457 / TC-1528 / TC-1669 / TC-1671 の順で並んでいることを確認する
  3. 順序ガードが同じ分類ブロックを検査していることを確認する
- **期待結果**: TC-1669 が TC-1528 の後ろにあり、以後の追加で局所的な番号順崩れを検出できる
- **スクリプト**: smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts

## TC-1080: MR 予選単体テスト — 8人ラウンドロビンの4試合/ラウンド前提を明記する
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #1080。`qualification-route.test.ts` の `roundMatches` に対する `toHaveLength(4)` は、8人グループのラウンドロビンでは各ラウンドが `n/2 = 8/2 = 4` 試合になるという前提を表す。fixture の人数が変わった時に失敗理由が分かるよう、単体テスト内で前提を明示する。
- **手順**:
  1. `qualification-route.test.ts` の MR raw insert assignedCourses テストを確認する
  2. `expect(roundMatches).toHaveLength(4)` の直前に8人ラウンドロビンの4試合前提コメントがあることを確認する
  3. コメントが `8/2 = 4` の人数根拠を含むことを確認する
- **期待結果**: 8人 MR 予選で各ラウンドが4試合になる理由が単体テスト上で読み取れ、将来の fixture 変更時に前提の更新漏れを検知できる
- **スクリプト**: smkc-score-app/__tests__/static/tc-1080-qualification-route-comment.test.ts

## TC-1017: MR 予選コースデッキ回数を試合レース数から分離する
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #1017。MR 予選では「4コースで1試合を構成する」ことと「フルコースデッキを4回シャッフルして予選全体の割当順を作る」ことが別仕様であるため、`TOTAL_MR_RACES` をデッキ繰り返し回数として流用しないことを固定する。
- **手順**:
  1. `qualification-route.ts` が `MR_QUALIFICATION_COURSE_DECK_REPEATS` を宣言していることを確認する
  2. `generateShuffledCourseList()` が `TOTAL_MR_RACES` ではなく `MR_QUALIFICATION_COURSE_DECK_REPEATS` でフルコースデッキを生成することを確認する
  3. 単体テストで MR コースリスト長が `COURSES.length * MR_QUALIFICATION_COURSE_DECK_REPEATS` になることを確認する
- **期待結果**: MR の1試合あたりレース数を変更しても、予選全体の4デッキ割当仕様が暗黙に変わらない
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/e2e/tc-1017-mr-course-deck-repeats.test.ts / smkc-score-app/__tests__/lib/api-factories/qualification-route.test.ts

## TC-1662: TC-1017 の配列長テストから未使用 Math.random mock を除去する
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #1662。TC-1017 の単体テストは MR コースデッキの配列長だけを検証するため、シャッフル順に影響する `Math.random` mock は不要である。未使用 mock を残すと、テストの意図が「順序固定も必要」に見えてしまう。
- **手順**:
  1. `qualification-route.test.ts` の TC-1017 単体テストを確認する
  2. 同テストが `generateShuffledCourseList()` の戻り値長だけを検証し、`Math.random` / `mockReturnValue` / `mockRestore` を使っていないことを確認する
  3. TC-1017 の static guard が引き続き MR デッキ回数の独立性を検査していることを確認する
- **期待結果**: TC-1017 の単体テストは配列長ポリシーだけを最小限に検証し、不要なランダム mock を持たない
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/e2e/tc-1017-mr-course-deck-repeats.test.ts / smkc-score-app/__tests__/lib/api-factories/qualification-route.test.ts

## TC-1664: TC-1017 静的ガードの抽出範囲を対象テスト固有の内容で検証する
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #1664。TC-1017 の static guard は `sectionBetween()` で単体テストの一部を切り出して `Math.random` mock の再導入を拒否するため、切り出した範囲が空や無関係なブロックでないことも確認する必要がある。
- **手順**:
  1. `tc-1017-mr-course-deck-repeats.test.ts` の static guard を確認する
  2. `sectionBetween()` の戻り値が空でないことを確認する
  3. 同じ戻り値に `MR_QUALIFICATION_COURSE_DECK_REPEATS` と `toHaveLength(COURSES.length * MR_QUALIFICATION_COURSE_DECK_REPEATS)` が含まれることを確認する
  4. その対象範囲に `Math.random` / `mockReturnValue` / `mockRestore` が含まれないことを確認する
- **期待結果**: static guard は TC-1017 の配列長テスト本体を検査していることを先に固定し、境界変更で無関係な範囲を検査してしまう退行を検出できる
- **スクリプト**: n/a (static coverage) — smkc-score-app/__tests__/e2e/tc-1017-mr-course-deck-repeats.test.ts

## TC-1666: TC-1664 文書 guard から issue 番号リテラル依存を外す
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: issue #1666。TC-1664 の文書 guard が `issue #1664` の文字列そのものに依存すると、E2E シナリオ文書の整理で issue 番号表記を変えただけでもテストが壊れる。guard はシナリオ固有の仕様語に絞る。
- **手順**:
  1. `tc-1017-mr-course-deck-repeats.test.ts` の TC-1664 文書 guard を確認する
  2. 同 guard が `sectionBetween`、`MR_QUALIFICATION_COURSE_DECK_REPEATS`、`toHaveLength(COURSES.length * MR_QUALIFICATION_COURSE_DECK_REPEATS)` を確認していることを確認する
  3. 同 guard が `issue #1664` の文字列リテラルを要求していないことを確認する
- **期待結果**: TC-1664 の文書 guard は仕様内容に依存し、issue 番号表記の変更では壊れない
- **スクリプト**: n/a (static coverage) — smkc-score-app/__tests__/e2e/tc-1017-mr-course-deck-repeats.test.ts

## TC-717: GP決勝 — ラウンドごとのカップ組み合わせがFT3の5カップ目以外で重複しない
- **URL**: /api/tournaments/[temp-id]/gp/finals (GET)
- **authRequired**: true (admin)
- **背景**: GP Knockout / Finals では、各ラウンドに使用するカップの組み合わせをランダムに決め、同じラウンド内の全試合で同じ順番を使う。FT1 は 1 カップ、FT2 は最大 3 カップ、FT3 は最大 5 カップ。キノコ、フラワー、スター、スペシャルの4カップ内では重複しないため、同じラウンドでカップが重複し得るのは FT3 の 5 カップ目だけ。
- **補足**: `assignedCups` の検証は E2E runner と単体テストで共有する validator を使い、E2E スクリプト内部をテスト目的だけで export しない。
- **手順**:
  1. 28名予選 + 決勝ブラケット生成（17試合）
  2. `GET /api/.../gp/finals` で全マッチ取得
  3. 各マッチの `assignedCups` が非空で、`cup` が `assignedCups[0]` と一致することを確認
  4. 同一 `round` のマッチはすべて同じ `assignedCups` であることを確認
  5. FT2 相当のラウンドでは `assignedCups` が3件以下かつ重複なしであることを確認
  6. FT3 相当のラウンドでは `assignedCups` が5件で、先頭4件が重複なしであることを確認
  7. legacy/divergent な `assignedCups` バックフィルが必要な場合、同数の valid sequence はラウンド内で最初に見つかった sequence を canonical とすることを単体テストで確認する
  8. legacy/divergent な `assignedCups` バックフィルが必要な場合、GET は match ごとの `update()` ではなく round-scoped `updateMany()` を1ラウンド1回だけ実行し、`id IN (...)` で canonical と不一致の行だけを書き換えることを単体テストで確認する
  9. 一部 round-scoped update が失敗してもGETレスポンスは返し、失敗件数と理由を警告ログに残すことを単体テストで確認する
  10. 管理者スコア入力ダイアログを開き、FT2 は2カップ欄、FT3 は3カップ欄が最初から表示され、その自動表示分に削除ボタンがないことを確認
  11. クリーンアップ
- **期待結果**: ラウンドをまたいだ同カップは許可されるが、同じラウンドのカップ組み合わせは FT3 の5件目を除いて重複しない。FT数ぶんの初期カップ欄は削除できず、追加したカップ欄だけ削除できる。legacy 修復時のDB updateは同数の valid sequence を first-seen で決定し、round-scoped `updateMany()` によって O(matches) ではなく O(rounds) の書き込みに収まる。正規済み行は `id IN (...)` の対象から外し、一部失敗しても閲覧レスポンスを継続する
- **スクリプト**: tc-gp.js TC-717
- **補助検証**: `smkc-score-app/__tests__/app/api/tournaments/[id]/gp/finals/route.test.ts`

## TC-726: GP決勝 — 管理者スコア入力ダイアログの割り当てカップ表示を一度だけ評価する
- **URL**: /tournaments/[id]/gp/finals
- **authRequired**: true (admin)
- **背景**: 管理者のシンプルなカップ勝利数入力ダイアログでは、`selectedMatch.assignedCups` から表示用ラベルを作る。表示条件と badge 描画で同じラベル配列を共有し、同じ render 中に重複して組み立てない。
- **手順**:
  1. GP 決勝ページ実装を確認する
  2. 割り当てカップ表示ラベルは `assignedCups` を優先し、legacy `cup` にフォールバックすることを確認する
  3. ダイアログ内の表示条件と badge 描画が同じ表示ラベル配列を共有していることを確認する
- **期待結果**: `assignedCups` がある試合はその順番で badge を表示し、legacy `cup` だけの試合も単一 badge を表示する。表示条件と badge 描画は同じ配列を使う
- **スクリプト**: n/a (unit coverage) — smkc-score-app/__tests__/lib/gp-finals-assigned-cups.test.ts

## TC-718: GP決勝 — 管理者の手動合計スコア入力 (PR #585 マニュアルフォーム)
- **URL**: /api/tournaments/[temp-id]/gp/finals (PUT)
- **authRequired**: true (admin)
- **背景**: GP決勝の管理者ダイアログでは、カップごとに5レース入力をスキップして driver-points 合計を直接入力できる。保存値は `cupResults` にカップ単位で保持され、`points1`/`points2` はカップ勝利数になる。
- **手順**:
  1. 28名予選 + 決勝ブラケット生成
  2. M1 に2カップ分の手動 `cupResults` をPUT → 200
  3. `GET` で M1 を再取得し、`points1=2`、`points2=0`、`cupResults[1].points1=15`、`cupResults[1].points2=12` が保持されていることを確認
  5. クリーンアップ
- **期待結果**: 手動合計スコア PUT でカップ勝利数が更新され、カップごとのドライバーズポイント内訳が保持される

## TC-1103: GP決勝 — アッパーブラケットは取得カップ数だけで保存できる
- **URL**: /api/tournaments/[temp-id]/gp/finals (PUT)
- **authRequired**: true (admin)
- **背景**: GPのアッパーブラケットはカップ別のドライバーズポイント内訳ではなく、どちらが何本取ったかだけを記録できればよい。
- **手順**:
  1. 8名以上の GP 予選を完了し、決勝ブラケットを生成する
  2. アッパーブラケット M1 に `{ score1: 2, score2: 0 }` をPUTする
  3. `GET /api/.../gp/finals` で M1 を再取得する
  4. M1 が `completed=true`、`points1=2`、`points2=0`、`cupResults=null` で保存されていることを確認
  5. クリーンアップ
- **期待結果**: アッパーブラケットは `2-0` のような取得カップ数だけで保存・進行でき、不要なカップ別明細を作らない
- **スクリプト**: tc-gp.js TC-1103 (`npm run e2e:gp`, preview: `npm run e2e:preview:gp`)

## TC-1109: GP決勝 — カップフォーム固定数は最大カップ数ヘルパーを直接使う
- **URL**: /tournaments/[temp-id]/gp/finals
- **authRequired**: true (admin)
- **背景**: GP決勝の入力ダイアログでは、FT2/FT3に必要な最低カップフォーム数を `getGpFinalsMaxCups` で決める。ページ内に薄い別名ラッパーや同じ引数構築を複数置くと、ターゲット勝利数と最大カップ数の責務が読み取りづらくなる。
- **手順**:
  1. GP決勝ページ実装を確認する
  2. スコアダイアログ初期化時の固定カップ数が `getGpFinalsMaxCups(...)` を match-shaped identifier で直接参照していることを確認する
  3. 追加カップ削除ボタンの保護数も `getGpFinalsMaxCups(...)` を match-shaped identifier で直接参照していることを確認する
  4. `getLockedCupCountForMatch` のようなページ内ラッパーが残っていないことを確認する
- **期待結果**: FT2は3カップ、FT3は5カップまでの固定フォーム数を最大カップ数ヘルパーで直接表現し、ページ内の薄いラッパーや重複した引数構築を経由しない
- **スクリプト**: tc-gp.js TC-1109 (`npm run e2e:gp`, preview: `npm run e2e:preview:gp`)

## TC-1100-1085: GP/MR決勝 — top-four target-wins helper の命名を実態に合わせる
- **URL**: /tournaments/[temp-id]/gp/finals, /tournaments/[temp-id]/mr/finals
- **authRequired**: true (admin)
- **背景**: issues #1100, #1085。target-wins 共有ヘルパーは Winners Final / Losers Semi Final / Losers Final / Grand Final / Grand Final Reset を同じ上位4帯として扱う。`losers_sf` を含むため、`isFinalRound` という名前だと「決勝だけ」と誤読しやすい。
- **手順**:
  1. `finals-target-wins.ts` の共有ヘルパー名を確認する
  2. helper 名が `isTopFourTargetRound` で、`losers_sf` を対象に含めていることを確認する
  3. 古い `isFinalRound` helper 名が残っていないことを確認する
  4. MR は上位4帯をFT9、GPは上位4帯をFT3として扱い、`winners_sf` はそれぞれFT7/FT2に残ることを確認する
- **期待結果**: target-wins helper 名が `losers_sf` を含む実態を表し、MR/GPの上位4帯 target-wins 挙動は変わらない
- **スクリプト**: __tests__/static/tc-1100-1085-finals-target-naming.test.ts, __tests__/lib/finals-target-wins.test.ts

## TC-727: GP決勝 — 取得カップ数がFT上限を超える保存を拒否する
- **URL**: /api/tournaments/[temp-id]/gp/finals (PUT)
- **authRequired**: true (admin)
- **背景**: GP決勝のシンプル入力は取得カップ数だけを保存するが、FT2/FT3の必要勝利数を超える値は進行状態を壊すため拒否する。
- **手順**:
  1. 8名以上の GP 予選を完了し、決勝ブラケットを生成する
  2. FT2 のアッパーブラケット M1 に `{ score1: 3, score2: 0 }` をPUTする
  3. HTTP 400 と `Cup wins must be integers from 0 to 2` が返ることを確認する
  4. `GET /api/.../gp/finals` で M1 を再取得する
  5. M1 が未完了のまま更新されていないことを確認する
- **期待結果**: FT上限を超えるシンプル取得カップ数は保存されず、ブラケット進行も発生しない
- **スクリプト**: tc-gp.js TC-727 (`npm run e2e:gp`, preview: `npm run e2e:preview:gp`)

## TC-710: GP カップ不一致修正の拒否
- **URL**: /api/tournaments/[temp-id]/gp (PATCH with correction)
- **authRequired**: true (player)
- **背景**: プレイヤーが修正スコアを送信する際、元のカップと異なるカップを指定した場合は拒否されなければならない
- **手順**:
  1. 2名プレイヤーで GP を設定し、マッチにスコアを入力（cup=Mushroom）
  2. プレイヤーとしてログインし、同マッチに cup=Flower で修正スコアを送信
  3. 422 エラーが返ること（カップ不一致）
  4. クリーンアップ
- **期待結果**: 修正スコア送信時にカップが一致しない場合は 422 で拒否される

## TC-712: GP 決勝 Grand Final — 同点カップ後に次カップで決着
- **URL**: /tournaments/[temp-id]/gp/finals (PUT M16)
- **authRequired**: true (admin)
- **背景**: Grand Final でカップ内のGPポイントが同点の場合、サドンデスではなく次カップを行い、FT3に到達した時点でチャンピオンを確定する
- **手順**:
  1. 28名予選 + 決勝ブラケット生成
  2. M1〜M15 を API で入力して Grand Final (M16) まで進める
  3. M16 に同点カップ1つ + P1勝利カップ3つの `cupResults` をPUTする
  4. `suddenDeathWinnerId` なしで200が返り、`points1=3, points2=0` でチャンピオンが確定すること
  5. クリーンアップ
- **期待結果**: GP Grand Final の同点カップは次カップ継続で処理され、FT3到達時に決着する

## TC-713: GP 予選同着解決 — 同順位バーが rankOverride 設定後に消える
- **URL**: /tournaments/[temp-id]/gp
- **authRequired**: true (admin)
- **背景**: BM TC-324 / MR TC-620 の GP 版。全プレイヤーが同一ドライバーポイントでタイとなる場合に「Tied ranks detected / 同順位が検出されました」バナーが表示され、resolveAllTies で全員に distinct な rankOverride を設定すると消えることを検証する
- **手順**:
  1. プレイヤー3名 + トーナメントを作成し、GP グループ設定を行う
  2. 全ての non-BYE マッチで P1 が 5 レース全勝（9pt × 5 = 45pt）するスコアを入力する（全員同着状態を作る）
  3. `/gp` を開き、順位表タブで「同順位が検出されました / Tied ranks detected」バナーが表示されることを確認する（hasBannerBefore）
  4. `resolveAllTies(adminPage, tournamentId, 'gp')` で N 人全員に distinct な `rankOverride` を PATCH する
  5. `/gp` を再訪問し、バナーが消えていることを確認する（hasBannerAfter=false）
  6. クリーンアップ
- **期待結果**: GP でも rankOverride 設定後に同順位バーが消える

## TC-715: GP Top-24 Playoff UI フロー
- **URL**: /tournaments/[temp-id]/gp → /gp/finals
- **authRequired**: true (admin)
- **背景**: BM TC-515 / MR TC-615 の GP 版。`topN=24` で GP 決勝生成するとまず 8 試合のバラッジが生成される。UI が以下の流れを正しく提示すること: 予選ページ「Start Playoff」表示 → Finals ページ Playoff ブラケット表示 → playoff_r2 完了で playoffComplete=true → Phase 2（Upper Bracket）生成
- **手順**:
  1. 28名予選完了状態のトーナメントで qualificationConfirmed=false のまま既存ブラケットをリセットし、その後 qualificationConfirmed=true にする
  2. 予選ページ（`/gp`）で「Start Playoff (バラッジ開始)」ボタンが表示されることを確認する
  3. `POST /api/tournaments/[id]/gp/finals { topN: 24 }` で Top-24 Playoff を生成する
  4. `/gp/finals` に遷移し「Playoff (Barrage)」ラベルと M1 が表示されることを確認する
  5. playoff_r1 M1〜M4、playoff_r2 M5〜M8 を playoff のFT1カップ勝利数で API 入力し、`playoffComplete=true` を確認する
  6. `POST /gp/finals { topN: 24 }` で Phase 2（Upper Bracket）を生成し `phase='finals'` が返ることを確認する
  7. `/gp/finals` に戻り「Upper Bracket / アッパーブラケット」が表示されることを確認する
  8. クリーンアップ
- **期待結果**: GP Top-24 バラッジの UI フローが全段階で正常動作する

## TC-716: GP 予選ページの決勝ブラケット存在状態 + リセット
- **URL**: /tournaments/[temp-id]/gp
- **authRequired**: true (admin)
- **背景**: BM TC-516 / MR TC-616 の GP 版。決勝ブラケット生成後に予選ページを再訪すると「View Tournament」が表示される。危険操作である「Reset Bracket」は予選ロック中は非表示で、直接 API リセットも 409 で拒否され、予選ロック解除後のみ表示される
- **手順**:
  1. 28名予選完了状態のトーナメントで qualificationConfirmed=true にし、Top-8 ブラケットを生成する
  2. 予選ページ（`/gp`）を開き「View Tournament / トーナメントを見る」が表示され、「Reset Bracket / ブラケットリセット」が表示されないことを確認する
  3. ロック中に `POST /api/tournaments/[id]/gp/finals { reset: true }` を直接呼び、409 `QUALIFICATION_LOCKED` が返ることを確認する
  4. qualificationConfirmed=false にして予選ロックを解除し、「Reset Bracket / ブラケットリセット」ボタンが表示されることを確認する
  5. 「Reset Bracket / ブラケットリセット」ボタンをクリックし、確認ダイアログで OK を選択する
  6. リセット後は予選が未ロックのままなので、「Reset Bracket」と「Start Playoff / Generate Finals Bracket」が表示されないことを確認する
  7. クリーンアップ
- **期待結果**: ブラケット生成後は「View Tournament」のみ、予選ロック中の直接 API リセットは拒否され、予選ロック解除後だけ「Reset Bracket」が表示され、リセット後は再ロックまで生成ボタンも出ない

## TC-719: GP 決勝 — 非 Grand Final マッチの同点カップ継続
- **背景**: GP の Grand Final 以外のブラケットマッチでも、カップ内同点時はサドンデスではなく次カップへ進むこと
- **手順**:
  1. 28名予選完了済みフィクスチャで 8名ブラケットを生成する
  2. winners_qf の ready なマッチを取得する
  3. 同点カップ + P1勝利1カップをPUTし、M1が `points1=1, completed=false` のまま次マッチへ進まないこと
  4. P1勝利カップをさらに追加し、FT2到達でM1が `points1=2, completed=true` になり次マッチへ進むこと
- **期待結果**: QF などの非 GF マッチでも同点カップは未決着扱いになり、次カップでFT到達時のみ進行する
- **スクリプト**: tc-gp.js TC-719

## TC-820: MR match/[matchId] ページがview-onlyであることを確認
- **URL**: /tournaments/[temp-id]/mr/match/[matchId]
- **authRequired**: true (player)
- **背景**: MRのmatch detailページは参加者によるスコア送信ではなく結果閲覧所用的
- **手順**:
  1. MR qualification済みの一時トーナメントとプレイヤー2名を作成
  2. pending matchのIDを取得
  3. プレイヤーとして `/mr/match/[matchId]` にアクセス
  4. 「スコア入力」ボタンまたはフォームが存在しないことを確認（view-only）
  5. クリーンアップ
- **期待結果**: MR match detailはスコア入力UIなしで結果表示のみ

## TC-821: GP match/[matchId] ページがview-onlyであることを確認
- **URL**: /tournaments/[temp-id]/gp/match/[matchId]
- **authRequired**: true (player)
- **背景**: GPのmatch detailページは直接アクセスの場合結果閲覧のみ（スコア送信はparticipant経由）
- **手順**:
  1. GP qualification済みの一時トーナメントとプレイヤー2名を作成
  2. pending matchのIDを取得
  3. プレイヤーとして直接 `/gp/match/[matchId]` にアクセス
  4. レース入力用のSelect/Input要素がないことを確認
  5. クリーンアップ
- **期待結果**: GP match detailは直接アクセスでは入力UIなし（participantページから入力）

## TC-822: MR scoresConfirmed後のスコア報告が400でブロックされることを確認
- **URL**: /api/tournaments/[temp-id]/mr/match/[matchId]/report (POST)
- **authRequired**: true (player)
- **Issue**: #2076
- **背景**: MRのdual reportにおいて、管理者が不一致を確定（scoresConfirmed）後のPUTはブロックされる
- **手順**:
  1. dualReportEnabled=true のトーナメントでMR matchを作成
  2. P1とP2が異なるスコアを報告し、mismatch状態を作る
  3. 管理者が match detail PUT で scoresConfirmed=true に確定
  4. 再度スコア報告POSTを送信 → 400で拒否されること
  5. クリーンアップ
- **期待結果**: scoresConfirmed後のスコア報告は400で拒否され、MRMatch.scoresConfirmed=true が保持される

## TC-823: セクション公開トグル — レイアウトタブの「未公開」バッジがリアルタイム更新される (issue #621)
- **URL**: /tournaments/[id]/bm, /tournaments/[id]/overall-ranking
- **authRequired**: true (admin)
- **背景**: 管理者がモード公開スイッチをクリックすると、`publicModesChanged` カスタムイベント経由でレイアウトがトーナメントデータを再 fetch し、タブの「未公開」バッジがページリロードなしに更新される
- **手順**:
  1. 新規トーナメントを作成する（publicModes=[]）
  2. `/bm` ページを開き、BM タブに `flag-draft` バッジ（未公開マーカー）が表示されることを確認する
  3. 「バトルモード: 未公開」スイッチをクリックして公開に切り替え、タブ再 fetch を待つ
  4. タブバッジが消えていることを確認する
  5. 再度スイッチをクリックして未公開に戻し、タブ再 fetch を待つ
  6. タブバッジが再表示されることを確認する
  7. `/overall-ranking` ページを開き、総合タブに `flag-draft` バッジが表示されることを確認する
  8. 「総合: 未公開」スイッチをクリックして公開に切り替え、総合タブのバッジが消えることを確認する
  9. 再度スイッチをクリックして未公開に戻し、総合タブのバッジが再表示されることを確認する
  10. クリーンアップ
- **期待結果**: 公開トグル後、タブバッジがページリロードなしに追従する
- **スクリプト**: tc-all.js TC-823

---

## TT (Time Trial / TA) フルワークフローテスト  *(TC-801/802/804/805/806/807/808/809/810/811/837/839/840/878/896/897 実装済み)*

### 設計方針
- **エントリー数**: 28名（TA はグループ分けなし、全員が同一プールでタイムを競う）
- **コース数**: 1 ラウンド = 20 コース（cycle、no-repeat until all used）
- **フェーズ**: 予選 → Phase 1 (17〜24位の8→4) → Phase 2 (1〜16位の16→4) → Phase 3 (決勝、最大16名のノックアウト)
- **タイ処理**: 同タイムは平均ポイント按分、per-course 線形補間（50pt 上限）
- **スコア**: `qualification-scoring.ts` で算出（合計値だけ floor、per-course は double-floor しない）

## TC-801: TA予選フルフロー（28名、20コース）
- **URL**: /tournaments/[temp-id]/ta
- **authRequired**: true (admin)
- **手順**:
  1. 一時トーナメント + プレイヤー28名 + TA 予選 entry 作成
  2. 各プレイヤーに 20 コース分の time を API でランダム入力
  3. 順位表が `qualification-scoring.ts` の per-course 線形補間 + 平均按分で算出されていること
  4. floor は合計値のみ（per-course の double-floor になっていないこと）
  5. クリーンアップ
- **期待結果**: 28名のTA予選順位がスコア式どおりに集計される

## TC-802: TAプレイヤーログインからタイム入力
- **URL**: /auth/signin -> /tournaments/[temp-id]/ta/participant
- **authRequired**: true (player)
- **手順**:
  1. 一時トーナメント + プレイヤー1名 + entry 作成
  2. 一時ブラウザでログイン → `/ta/participant`
  3. participant UI のタイム入力欄に値を入力して送信
  4. TT entry API で入力値（または totalTime）が永続化されること
  5. クリーンアップ
- **期待結果**: 参加者UIから自分の予選タイムを入力・保存できる

## TC-839: TA予選タイム入力ダイアログのモバイル1列表示
- **URL**: /auth/signin -> /tournaments/[temp-id]/ta
- **authRequired**: true (player)
- **背景**: issue #839。iPhone 13 mini 幅で TA 予選タイム入力欄が横2列になり、フォーカス時に入力欄が狭く見える。
- **手順**:
  1. 共有 TA 予選 fixture のプレイヤーでログイン
  2. viewport を iPhone 13 mini 相当の 375x812 に設定して `/ta` を開く
  3. タイム入力タブから自分の `Edit Times` ダイアログを開く
  4. 4つの cup card が縦1列に積まれていることを bounding box で確認する
  5. 最初の `M:SS.mm` 入力欄が十分な幅を保っていることを確認する
- **期待結果**: モバイル幅では Mushroom/Flower/Star/Special が上から順に1列で表示され、入力欄の視認性が落ちない

## TC-837: TA予選順位表にコース別No.1獲得数を表示
- **URL**: /tournaments/[temp-id]/ta
- **authRequired**: true (admin)
- **背景**: issue #837。TA予選の結果表示で、各プレイヤーが20コース中いくつのコースで最速（Nb #1）を取ったか確認したい。
- **手順**:
  1. 共有 TA 予選 fixture に20コースのタイムを投入する
  2. API レスポンスからコースごとの最速者数を算出する
  3. `/ta` の予選順位表を開き、`Nb #1` 列が表示されることを確認する
  4. 対象プレイヤー行の `Nb #1` セルが算出値と一致することを確認する
- **期待結果**: TA予選順位表に `Nb #1` が表示され、コース別最速獲得数が正しく出る

## TC-840: TA予選ペア相手をタイム一覧から編集できる
- **URL**: /auth/signin -> /tournaments/[temp-id]/ta
- **authRequired**: true (player)
- **背景**: issue #840。サーバーは partnerId による代理入力を許可しているが、TA予選のタイム一覧UIがペア相手を閲覧専用扱いにすると代理編集できない。
- **手順**:
  1. 共有 TA 予選 fixture の2名を partnerId で双方向ペアにする
  2. 2人目のプレイヤーでログインして `/ta` を開く
  3. タイム入力タブで1人目（ペア相手）の行を確認する
  4. ペア相手の行に `タイム編集` / `Edit Times` ボタンが出て、`タイム閲覧` / `View Times` だけになっていないことを確認する
- **期待結果**: プレイヤーは自分のペア相手の予選タイムをTA一覧画面から編集できる

## TC-878: TA予選タイム一覧でTV番号を選択して配信に反映できる
- **URL**: /tournaments/[temp-id]/ta
- **authRequired**: true (admin)
- **背景**: issue #878。TA予選のタイム入力・一覧画面にも、決勝フェーズと同様にTV1/TV2へプレイヤー名を反映する導線が必要。
- **手順**:
  1. 管理者で共有 TA 予選 fixture の `/ta` タイム入力タブを開く
  2. 2名のプレイヤー行で TV1 / TV2 を選択する
  3. `配信に反映` / `Broadcast` ボタンを押す
  4. `/api/tournaments/[id]/broadcast` の player1Name / player2Name が選択した2名に更新されることを確認する
- **期待結果**: TA予選中でもTV番号選択から配信オーバーレイへプレイヤー名を反映できる

## TC-808A: TA配信反映 — TV3/TV4 は配信に反映されないことを明示する
- **URL**: /tournaments/[temp-id]/ta, /tournaments/[temp-id]/ta/finals
- **authRequired**: true (admin)
- **背景**: issue #808 / #1897。TA の TV3/TV4 は進行上の割り当てとして保存されるが、broadcast API が反映するのは TV1/TV2 の選手名だけである。オペレーターが「配信に反映」成功表示を TV3/TV4 まで反映されたと誤解しないよう、対象外であることを画面上に明示し、UI から送信される payload にも TV3/TV4 が含まれないことを確認する。
- **手順**:
  1. `tc-ta.js` の共有 TA 予選 fixture で、TA予選タイム入力画面のアクティブな選手を TV1 / TV2 / TV3 に割り当てる
  2. `TV3/TV4 のプレイヤーは配信に反映されません` / `TV3/TV4 players are not reflected in the broadcast` が表示されることを確認する
  3. `配信に反映` を押し、`page.route()` で `/api/tournaments/[id]/broadcast` の PUT body を捕捉して `player1Name` / `player2Name` が TV1/TV2 の選手名であり、`playerNName` 形式の配信名フィールドに TV3 の選手名が含まれないことを確認する
  4. drift guard で TA決勝 Phase 1/2/3 の各ラウンド入力にも、TV3/TV4 割り当て時の同じ注意文が残っていることを確認する
  5. hook unit test で、`配信に反映` は TV1/TV2 のみを broadcast API に送ることを固定する
- **期待結果**: TV3/TV4 が選ばれている状態で「配信に反映」を押しても、利用者は TV3/TV4 がOBS表示対象外であることを画面上で確認できる
- **スクリプト**: tc-ta.js TC-808A / e2e-cases-drift.test.ts / use-broadcast-reflect.test.ts

## TC-897: TAタイム入力欄フォーカス時にスマホ数字キーボードを出す
- **URL**: /auth/signin -> /tournaments/[temp-id]/ta
- **authRequired**: true (player)
- **背景**: issue #897。スマホでTAのタイム入力欄をフォーカスした時、通常テキストキーボードではなく数字入力しやすいキーボードを出したい。
- **手順**:
  1. モバイル viewport で `/ta` のタイム入力ダイアログを開く
  2. `M:SS.mm` 入力欄の `inputmode` が `decimal` であることを確認する
  3. `pattern` が数字・コロン・ドット向けであることを確認する
- **期待結果**: TAタイム入力欄はスマホで数字キーボードを促す属性を持つ

## TC-913: TAタイム入力欄のtitleヒントとplaceholderをi18nで表示
- **URL**: /auth/signin -> /tournaments/[temp-id]/ta
- **authRequired**: true (player)
- **背景**: issue #913。TAタイム入力欄の title ヒントが英語ハードコードになり、placeholder も翻訳キーから外れていた。
- **手順**:
  1. モバイル viewport で `/ta` のタイム入力ダイアログを開く
  2. 最初のタイム入力欄の `title` が `例: 123.45 または 1:23.45` または `Example: 123.45 or 1:23.45` であることを確認する
  3. `placeholder` が翻訳キー由来の `M:SS.mm` であることを確認する
- **期待結果**: TAタイム入力欄の入力例ヒントとplaceholderは各画面のi18n文字列から描画される

## TC-1987: TA TV番号入力 helper は非数値を null に正規化する
- **URL**: n/a (helper contract)
- **authRequired**: false
- **背景**: issue #1987。`parseTvNumberInput` が `abc` のような非数値文字列を `NaN` として返すと、TA決勝・撃墜フェーズのTV番号更新で想定外の値が残る可能性がある。
- **手順**:
  1. `tc-ta.js` の helper contract ケースで `parseTvNumberInput('3')` と `parseTvNumberInput('09')` が10進数として解釈されることを確認する
  2. `parseTvNumberInput('')` と `parseTvNumberInput('abc')` が `null` になることを確認する
  3. 単体テストでも同じ境界値を固定し、TA行コンポーネント側は helper の重複単体テストを持たないことを確認する
- **期待結果**: TAのTV番号 helper は空入力・非数値入力を保存可能な数値として扱わず、`null` に正規化する
- **スクリプト**: tc-ta.js TC-1987 / time-entry-layout.test.ts / ta-time-entry-rows.test.tsx

## TC-1996: TA決勝 row のTV番号を送信 payload と履歴に保存する
- **URL**: /tournaments/[temp-id]/ta/finals, /api/tournaments/[id]/ta/phases
- **authRequired**: true (admin)
- **背景**: issue #1996。TA決勝 row handler は `parseTvNumberInput(e.target.value)` でTV番号を数値化するが、UI row から submit payload、phase API の round 履歴までを通す E2E カバレッジがなかった。
- **手順**:
  1. 管理者で一時 TA fixture を作成し、Phase 3 へ昇格して `/ta/finals` でラウンドを開始する
  2. 1人目の決勝 row で TV3 を選択し、もう1人は TV番号を未選択のままにする
  3. 資格合計ではなく Phase 3 用の単走ラウンドタイムでラウンド結果を送信し、`/api/tournaments/[id]/ta/phases` の submit payload で1人目の `tvNumber` が数値 `3`、2人目に `NaN` や不要な `tvNumber` が含まれないことを確認する
  4. `GET /api/tournaments/[id]/ta/phases?phase=phase3` で保存済み round の results に `tvNumber: 3` と `tvNumber: null` が残ることを確認する
- **期待結果**: TA決勝のTV番号選択は UI row から API payload へ数値として渡り、未選択行は不正値ではなく `null` として履歴に残る
- **スクリプト**: tc-ta.js TC-1996 / e2e-cases-drift.test.ts / ta/phases route.test.ts

## TC-896: TA決勝フェーズのモバイル管理画面でプレイヤー名が見える
- **URL**: /tournaments/[temp-id]/ta/finals
- **authRequired**: true (admin)
- **背景**: issue #896。TA決勝フェーズの管理者スマホ画面で、タイム入力行の操作部品が横並びになりプレイヤー名が潰れて見えない。
- **手順**:
  1. 一時トーナメントに2名をTA予選登録し、Phase 3へ昇格する
  2. viewport を 375x812 にして `/ta/finals` を開く
  3. Round 1 を開始する
  4. 各プレイヤー行でプレイヤー名領域が表示され、TV選択・タイム入力・リトライボタンと重ならないことを bounding box で確認する
- **期待結果**: モバイル幅のTA決勝入力行でもプレイヤー名が十分な幅で表示される

## TC-803: TAペア機能 + パートナー編集 ✅ TC-318 でカバー済み
- **URL**: /api/tournaments/[temp-id]/ta + /ta/participant
- **authRequired**: true (player)
- **背景**: TC-318 (`e2e/tc-all.js` 内、行 879-970) が既に TA ペア結成と双方向タイム編集をカバーしているため本TCは統合済み
- **手順**: TC-318 を参照
- **期待結果**: TC-318 で検証済み

## TC-804: TA予選確定 → Phase 1 開始
- **URL**: /api/tournaments/[temp-id]/ta/phases (POST `promote_phase1`)
- **authRequired**: true (admin)
- **手順**:
  1. 28名予選完了
  2. `promote_phase1` を送信 → 17〜24位の8名が Phase 1 へ抽出
  3. Phase 1 ラウンドが開始されること
  4. プレイヤー側で予選タイム編集が disabled になること（TC-312 既存の確認）
  5. クリーンアップ
- **期待結果**: Phase 1 開始でノックアウト枠が確定し、予選タイムロックが効く

## TC-805: TA Phase 2 → 上位16名のノックアウト
- **URL**: /api/tournaments/[temp-id]/ta/phases (POST `promote_phase2`)
- **authRequired**: true (admin)
- **手順**:
  1. Phase 1 のラウンド結果を入力
  2. `promote_phase2` を送信 → 1〜16位の枠がノックアウトに進む
  3. 各プレイヤーが Phase 2 ラウンドのタイムを送信
  4. 順位/勝ち上がりが正しく更新されること
  5. クリーンアップ
- **期待結果**: Phase 2 が正しく進行する

## TC-806: TA Phase 3 → 決勝ラウンドとチャンピオン決定
- **URL**: /api/tournaments/[temp-id]/ta/phases (POST `promote_phase3`) + /ta/finals
- **authRequired**: true (admin)
- **手順**:
  1. Phase 2 完了
  2. `promote_phase3` で決勝（最大16名）を開始
  3. 決勝の各ラウンドのタイムを入力 → 上位者が勝ち上がる
  4. 最終ラウンドでチャンピオンが決定し UI 表示されること
  5. 「直前ラウンドを取り消す」ボタンで再入力できる（TC-314 と整合）
  6. クリーンアップ
- **期待結果**: TA決勝がフェーズ3で完結し、チャンピオン表示まで通る

## TC-807: TA Phase 3 ページが16名のエントリーを表示する
- **URL**: /tournaments/[temp-id]/ta/finals
- **authRequired**: true (admin)
- **背景**: Phase 3（決勝）ページが描画時に16名のエントリーを正しく表示することを確認
- **手順**:
  1. TC-806 同様に Phase 3 を開始
  2. `/ta/finals` ページを訪問
  3. 16名のプレイヤーが表示されていることを確認
  4. 各プレイヤーの current lives （残りライフ）が表示されていることを確認
  5. クリーンアップ
- **期待結果**: Phase 3 ページに16名のプレイヤーが正しく表示される

## TC-808: TA Finals チャンピオン決定時にチャンピオンバナーが表示される
- **URL**: /tournaments/[temp-id]/ta/finals
- **authRequired**: true (admin)
- **背景**: TA Finals でチャンピオンが決まったとき、ページに成功メッセージとチャンピオン名が表示されることを確認
- **手順**:
  1. TC-806/TC-807 同様に Phase 3 を開始し、全プレイヤーが脱落するまでラウンドを入力
  2. 最後のプレイヤーが残った時点で `/ta/finals` ページを更新
  3. 「Champion」バナーまたはテキストが表示されていることを確認
  4. クリーンアップ
- **期待結果**: チャンピオン決定時に Champion バナー/テキストがページに表示される

## TC-TA-FLOW-24: 24名 TA full lifecycle
- **URL**: /tournaments/[temp-id]/ta, /ta/phase1, /ta/phase2, /ta/finals
- **authRequired**: true (admin)
- **背景**: P=24 の TA は、予選 24名から Phase 1 (17-24位、8名)、Phase 2 (Phase 1 生存者 + 13-16位、8名)、Phase 3 (Phase 2 生存者 + 1-12位、16名) へ段階的に進む。個別 TC-804〜TC-808 は各状態を確認するが、このケースは新規トーナメントで予選凍結からチャンピオン表示までを一気通貫で検証する。
- **手順**:
  1. 一時トーナメントを作成し、24名を TA 予選に登録する
  2. `rank=1..24` になる deterministic times を seed し、順位が settle するまで待つ
  3. 予選を凍結し、`promote_phase1` で Phase 1 を開始する
  4. Phase 1 が 8名で始まり、4ラウンド後に4名生存することを確認する
  5. `promote_phase2` で Phase 2 を開始し、4名生存まで進行する
  6. `promote_phase3` で Phase 3 を開始し、16名から1名になるまでラウンドを進行する
  7. `/ta/finals` で Champion / チャンピオン / 優勝 表示を確認する
  8. TC-TA-FLOW-24-RANK として、総合ランキングの TA Finals 配点が脱落順序を反映することも同じ fixture で確認する
- **期待結果**: 24名 TA の予選凍結、Phase 1/2/3 昇格、life-based elimination、チャンピオン表示が一連の runner で完了する
- **スクリプト**: tc-ta-flow.js TC-TA-FLOW-24 (`npm run e2e:ta-flow`, preview: `npm run e2e:preview:ta-flow`)

## TC-TA-FLOW-24-RANK: TA Finals 総合ランキングが脱落順序で決定される
- **URL**: /api/tournaments/[temp-id]/overall-ranking
- **authRequired**: true (admin)
- **背景**: TA Finals は life-based elimination で、最後まで生存したプレイヤーが優勝。総合ランキングの順位は脱落した順（最後に脱落した人ほど高順位）で決まらなければならない。過去のバグでは `totalTime` 累積で順位を判定していたため、早期脱落でも各コースで速かったプレイヤーが、後期脱落で遅かったプレイヤーより上に出る現象が発生していた（JSMKC 2026 で観測）
- **手順**:
  1. 24名の TA Phase 3 を実行し、ランク順 (`60_000 + rank*200ms`) で全ラウンドを進行（rank=1 が常勝、rank=24 が最初に脱落）
  2. `/api/tournaments/[temp-id]/ta/phases?phase=phase3` でラウンド一覧を取得し、`eliminatedIds` を時系列で連結して脱落順序を抽出
  3. POST `/api/tournaments/[temp-id]/overall-ranking` でランキングを再計算
  4. champion (rank=1) の `taFinalsPoints` が正の値で、取得したランキング内の最大 TA Finals 点であることを確認する（点数テーブルの固定値には依存しない）
  5. `eliminatedIds` が2件未満の場合は比較不能として TC-TA-FLOW-24-RANK のみ SKIP し、誤解を招く 0 点同士の FAIL を出さないことを確認する
  6. 最後に脱落したプレイヤーの `taFinalsPoints` が、最初に脱落したプレイヤーの `taFinalsPoints` より大きいことを確認する
  7. Phase 3 ラウンド取得または POST `/overall-ranking` が 2xx 以外の場合、TC-TA-FLOW-24-RANK を FAIL として記録し、runFullFlow 全体から早期 return しないことを確認する
  8. `collectEliminationOrder` は Phase 3 レスポンスの `rounds` / `eliminatedIds` が欠損しても runner を落とさず、空文字や非文字列の playerId を脱落順序に混ぜないことを単体テストで固定する
  9. TypeScript テストから CommonJS helper を安全に import できるよう、`ta-flow-rank-assertions.d.ts` で公開 API の型を明示する
- **期待結果**: 総合ランキングの TA Finals 配点が「最後まで生き残った順」を反映する。早期脱落者が後期脱落者を上回ることはなく、比較不能な途中状態や再計算失敗もケース単位の明確な結果になる

## TC-1060: TA Finals Phase 1/2 脱落者の中間順位を全件検証する (issue #1060)
- **URL**: /api/tournaments/[temp-id]/overall-ranking
- **authRequired**: true (admin)
- **背景**: TA Finals の Phase 1/2 脱落者は Phase 2 が17〜20位、Phase 1 が21〜24位に割り当てられる。従来の回帰テストは境界値だけを `arrayContaining` で確認していたため、18・19・22・23位の割り当て誤りを検出できなかった。
- **手順**:
  1. Phase 3 の優勝者/脱落者に加え、Phase 2 の4名と Phase 1 の4名の脱落履歴を用意する
  2. Phase 2 round 1〜4 の `eliminatedIds` が 20→19→18→17 位へ逆順に割り当たることを確認する
  3. Phase 1 round 1〜4 の `eliminatedIds` が 24→23→22→21 位へ逆順に割り当たることを確認する
  4. `getTAFinalsPositions` の結果が1位、2位、17〜24位を欠落なく完全一致で返すことを確認する
- **期待結果**: TA Finals position mapping が境界値だけでなく 18・19・22・23 位を含む全対象順位を検証する
- **スクリプト**: smkc-score-app/__tests__/lib/points/overall-ranking.test.ts

## TC-1059: TA Finals Phase 1/2 の想定外脱落数は順位帯を越えない (issue #1059)
- **URL**: /api/tournaments/[temp-id]/overall-ranking
- **authRequired**: true (admin)
- **背景**: Phase 2 の脱落者は17〜20位、Phase 1 の脱落者は21〜24位にだけ割り当てる。想定外データで Phase 2 に5名以上、Phase 1 に5名以上の `eliminatedIds` が残ると、以前の実装では position を単純に減算し続けて Phase 2 が16位以下、Phase 1 が20位以下へ溢れる可能性があった。
- **手順**:
  1. Phase 3 の優勝者/脱落者に加え、Phase 2 と Phase 1 に通常より多い脱落履歴を用意する
  2. `getTAFinalsPositions` を実行し、Phase 2 由来の順位が17〜20位だけに収まることを確認する
  3. Phase 1 由来の順位が21〜24位だけに収まることを確認する
  4. 範囲外の余剰脱落者が16位以下や20位以下に割り当てられないことを確認する
- **期待結果**: TA Finals の Phase 1/2 position mapping はデータ不整合時もフェーズごとの順位帯を越えず、Phase 3 の順位帯と衝突しない
- **スクリプト**: smkc-score-app/__tests__/lib/points/overall-ranking.test.ts + smkc-score-app/__tests__/docs/e2e-cases-drift.test.ts

## TC-1062: 予選同着プレーオフの配信ラベルは表示言語と一致する (issue #1062)
- **URL**: /tournaments/[temp-id]/bm, /tournaments/[temp-id]/mr
- **authRequired**: true (admin)
- **背景**: BM/MR 予選で同順位プレーオフが必要になったとき、管理画面の同着プレーオフカードと OBS 配信用 `matchLabel` は同じ翻訳キーを使う。過去の実装ではカード表示だけが翻訳され、配信ラベルは英語固定の `Qualification Playoff Rank N` になっていた。
- **手順**:
  1. 2名以上が同じ暫定順位になる予選データを用意し、`QualificationPlayoffManager` を表示する
  2. 同着プレーオフカードのタイトルが `playoffGroupTitle` の翻訳で表示されることを確認する
  3. 管理者として「配信に反映」を実行する
  4. `onBroadcast` に渡される `matchInfo.matchLabel` がカードタイトルと同じ `playoffGroupTitle` 翻訳値になることを確認する
- **期待結果**: OBS 配信用の lower-frame label は UI 表示と同じ言語・同じ順位表記になる
- **スクリプト**: smkc-score-app/__tests__/components/tournament/qualification-playoff-manager.test.tsx + smkc-score-app/__tests__/static/tc-1062-qualification-playoff-label.test.ts

## TC-1068: TA Finals の orphan eliminated entry は末尾に並ぶ (issue #1068)
- **URL**: /api/tournaments/[temp-id]/ta/phases?phase=phase3
- **authRequired**: true (admin)
- **背景**: `eliminated: true` だが Phase 3 の `rounds[].eliminatedIds` に存在しない legacy/orphan entry は、脱落ラウンドを復元できないため、round-backed の脱落者より低い順位として扱う。
- **手順**:
  1. Phase 3 entries に active player、round 1 脱落者、round 2 脱落者、`eliminated=true` だが `eliminatedIds` 未登録の orphan player を用意する
  2. `/api/tournaments/[temp-id]/ta/phases?phase=phase3` の表示用 entries 並び順を取得する
  3. active player が先頭、round 2 脱落者、round 1 脱落者、orphan player の順になることを確認する
  4. orphan player の速い qualification time や rank が round-backed 脱落者を追い越さないことを確認する
- **期待結果**: `eliminatedIds` に履歴がない eliminated entry は fallback round `-1` として扱われ、すべての round-backed 脱落者の後ろに表示される
- **スクリプト**: smkc-score-app/__tests__/app/api/tournaments/[id]/ta/phases/route.test.ts

## TC-1067: TA Finals の同時脱落者は eliminatedIds の順序で並ぶ (issue #1067)
- **URL**: /api/tournaments/[temp-id]/ta/phases?phase=phase3
- **authRequired**: true (admin)
- **背景**: 同一ラウンドで同じ `timeMs` のまま複数プレイヤーが脱落した場合、表示順位は `rounds[].eliminatedIds` の配列順で安定させる。`eliminatedIds` は同ラウンド・同タイムの脱落者を並べるための保存順で、先頭ほど表示順でも先に扱う。
- **手順**:
  1. Phase 3 entries に active player と、同一ラウンドで脱落した2名を用意する
  2. 該当 round の `results` では2名の `timeMs` を同じ値にする
  3. 該当 round の `eliminatedIds` を `[player-a, player-b]` にする
  4. `/api/tournaments/[temp-id]/ta/phases?phase=phase3` の表示用 entries 並び順を取得する
- **期待結果**: active player が先頭になり、同一ラウンド・同一タイムの脱落者は `eliminatedIds` の先頭 `player-a`、次に `player-b` の順に並ぶ
- **備考**: route test の fixture は `totalTime` / `rank` を意図的に `eliminatedIds` 順と逆向きにし、同一ラウンド・同一タイムでは fallback の qualification fields ではなく `eliminatedIds` index が使われることを固定する
- **スクリプト**: smkc-score-app/__tests__/app/api/tournaments/[id]/ta/phases/route.test.ts

## TC-809: TA Phase 1 で未提出ラウンドをキャンセルできる
- **URL**: /tournaments/[temp-id]/ta/phase1
- **authRequired**: true (admin)
- **背景**: ラウンド開始後にコース選択や対戦準備をやり直したいケースの回復手段
- **手順**:
  1. 一時トーナメントを作成し、8名を TA 予選に登録する
  2. qualification entry に `rank=17..24` と有効な `times` / `totalTime` を設定する
  3. 予選を凍結し、`promote_phase1` で Phase 1 を開始する
  4. `/ta/phase1` でラウンド 1 を開始する
  5. 「ラウンドキャンセル」を実行する
  6. rounds から当該ラウンドが削除され、プレイヤー状態が全員 active のままであることを確認する
- **期待結果**: 未提出ラウンドを UI からキャンセルすると、ラウンド記録が消えて同じフェーズをやり直せる

## TC-810: TA Phase 1 で提出済みラウンドを取り消して再入力できる
- **URL**: /tournaments/[temp-id]/ta/phase1
- **authRequired**: true (admin)
- **背景**: Phase 3 undo だけでなく、通常の単純敗退フェーズでも復旧できることを確認する
- **手順**:
  1. 一時トーナメントを作成し、8名を TA 予選に登録する
  2. qualification entry に `rank=17..24` と有効な `times` / `totalTime` を設定する
  3. 予選を凍結し、`promote_phase1` で Phase 1 を開始する
  4. ラウンド 1 を開始して全員分のタイムを送信し、1名が敗退した状態にする
  5. 「直前ラウンドを取り消す」を実行する
  6. 最終ラウンドの `results` が空に戻り、敗退状態が復元され、再入力用UIが復帰することを確認する
- **期待結果**: Phase 1 でも提出済みラウンドを UI から取り消して、そのラウンドをやり直せる

## TC-811: TA 予選凍結後はプレイヤーがタイムを再編集できない
- **URL**: /auth/signin -> /tournaments/[temp-id]/ta/participant
- **authRequired**: true (player + admin setup)
- **背景**: TC-312 は「ノックアウト開始後」のロック確認だが、予選凍結だけでも編集禁止になることを別途保証する
- **手順**:
  1. 一時トーナメントを作成し、対象プレイヤー1名を TA 予選に登録する
  2. qualification entry に有効な `times` / `totalTime` を設定する
  3. プレイヤーとして `/ta/participant` を開き、入力欄と送信ボタンが有効であることを確認する
  4. 管理者で予選を凍結する
  5. プレイヤー側でページを再読み込みし、「ステージ凍結」警告が表示され、入力欄と送信ボタンが disabled になることを確認する
  6. プレイヤー権限の PUT `/api/tournaments/[temp-id]/ta` が 403 で拒否されることを確認する
- **期待結果**: 予選凍結後はノックアウト開始前でもプレイヤーは自分のタイムを再編集できない

## TC-336: TA フェーズ API 構造確認 — GET /api/tournaments/[id]/ta/phases
- **URL**: /api/tournaments/[id]/ta/phases
- **authRequired**: false (公開GETエンドポイント)
- **背景**: TA 決勝フェーズ（Phase1/2/3）のステータスを返す API の契約を確認する。
  フロントエンド(`TAEliminationPhase`)はこのエンドポイントをポーリングしてフェーズ状態を
  取得するため、レスポンス形式が崩れると UI 全体が壊れる。
- **手順**:
  1. `phase` パラメータなしで GET → `{ success: true, data: { phaseStatus: {...} } }` を検証
  2. `?phase=phase1` で GET → `entries`, `rounds`, `availableCourses` が配列として含まれることを確認
  3. `?phase=invalid` で GET → 400 バリデーションエラーを確認
- **期待結果**:
  - フェーズ指定なし: `phaseStatus` オブジェクトのみ (entriesなし)
  - `?phase=phase1`: `entries`/`rounds`/`availableCourses` が追加される
  - 不正 phase パラメータ: 400

## TC-338: セキュリティ — 非公開トーナメントは非 admin に一覧 API で漏洩しない
- **URL**: GET /api/tournaments
- **authRequired**: false (セキュリティ検証のため非認証でリクエスト)
- **背景**: Issue #612 修正。`publicModes: []` のプライベートトーナメントは
  `GET /api/tournaments` から除外される必要がある。変更前は全件返却で curl/DevTools
  でトーナメント名・日付が列挙可能だった。
- **手順**:
  1. admin として `publicModes: []` のトーナメントを作成
  2. `https` モジュールで `GET /api/tournaments?limit=100` をセッションなしで送信
  3. レスポンスの `data.data` 配列に作成したトーナメントが含まれないことを確認
  4. admin セッションからは同一エンドポイントで取得できることを確認
  5. テストトーナメントを削除
- **期待結果**:
  - 非認証リクエストに新規プライベートトーナメントが含まれない
  - admin リクエストには含まれる
- **スクリプト**: tc-all.js TC-338

---

## TC-339: セクション公開トグル — `publicModes` 独立公開制約の検証
- **URL**: PUT /api/tournaments/:id
- **authRequired**: true (admin)
- **背景**: `publicModes` は `ta/bm/mr/gp/overall` の重複なし配列で、各セクションは独立して公開・非公開にできる。
- **手順**:
  1. トーナメント作成 → `PUT publicModes: ["ta", "bm"]` → 200 で `["ta", "bm"]` が返る
  2. `PUT publicModes: ["bm"]` → 200 で BM だけ公開される
  3. `PUT publicModes: ["overall"]` → 200 で総合ランキングだけ公開される
  4. `PUT publicModes: ["foo"]` / `["ta", "ta"]` → 400 VALIDATION_ERROR
  5. `GET /api/tournaments` を非認証で → 公開後のトーナメントが一覧に現れる
- **期待結果**:
  - `ta/bm/mr/gp/overall` の任意の重複なしサブセットは受理される
  - 不明な値と重複は 400 で拒否される
  - 公開後はトーナメントが非 admin の一覧に現れる
- **スクリプト**: tc-all.js TC-339

---

## TC-340: レイアウト公開ボタン — モード公開後にタブの「未公開」バッジが消える
- **URL**: /tournaments/:id/ta（または bm/mr/gp）
- **authRequired**: true (admin)
- **背景**: Issue #614 修正。各モードページにあった公開ボタンをレイアウト（layout.tsx）
  の共通エリアに移動した。これにより (1) 公開ボタン位置が全モードで統一され、
  (2) 公開操作後にレイアウト自体の `tournament.publicModes` が更新されるため、
  タブの「未公開」バッジが即座に消える。
- **手順**:
  1. 非公開トーナメントの TA ページを開く（タブバーに「未公開」バッジが表示されること）
  2. タブバー下の公開コントロールエリアで「タイムトライアル: 公開」ボタンをクリック
  3. リロードなしでタブの「未公開」バッジが消えることを確認
  4. 「タイムトライアル: 未公開」ボタンをクリック → バッジが再表示されることを確認
- **期待結果**:
  - 公開ボタンはタブバー直下のコントロール行に常に表示される
  - 公開/未公開切替後に「未公開」バッジがリロードなしで更新される
  - 操作後のページに「未公開」の古い表示が残らない
- **スクリプト**: `e2e/tc-all.js` TC-340

---

## TC-341: 認証済みプレイヤーが非公開トーナメントの参加者ページにアクセス可能
- **URL**: /api/tournaments/:id (GET, fields=summary)
- **authRequired**: true (player credentials)
- **背景**: Issue #615 修正後に発生したリグレッション。publicModes:[] の非公開トーナメントに対し
  `GET /api/tournaments/:id?fields=summary` が認証済みプレイヤーへ 403 を返していた（管理者のみ
  許可する条件が認証済みユーザー全体に広すぎた）。TA participant/page.tsx はこの API を使って
  トーナメント情報を取得するため、403 になるとページが「Tournament Not Found」と表示される。
  修正後: 未認証リクエストのみ 403、認証済みユーザー（プレイヤーを含む）は 200 を受け取る。
- **手順**:
  1. プレイヤー credentials でログイン済みのコンテキストを作成
  2. publicModes:[] の非公開トーナメントを管理者 API で作成
  3. プレイヤーコンテキストから `GET /api/tournaments/:id?fields=summary` を呼ぶ
  4. ステータスが 200 かつ `success: true` であることを確認
  5. 未認証リクエストで同 URL を呼び、403 が返ることを確認
  6. トーナメント削除（クリーンアップ）
- **期待結果**:
  - 認証済みプレイヤー: 200 + `{ success: true, data: { id, name, ... } }`
  - 未認証リクエスト: 403
- **スクリプト**: tc-all.js TC-341

---

## TC-342: PUT /tt/entries — 部分的 times は 400 を返す (issue #624)
- **URL**: PUT /api/tournaments/:id/tt/entries/:entryId
- **authRequired**: true (admin)
- **背景**: Issue #624 修正。`times` が全 20 コース未満の場合、`recalculateRanks` が
  `totalTime=null` に上書きしてしまう問題。バリデーションで 400 を返すよう修正した。
- **手順**:
  1. トーナメント作成・アクティベート → TA エントリー作成
  2. PUT `/tt/entries/:entryId` に 2 コース分のみの `times` を送信（version は最新）
  3. 400 が返り、エラーメッセージに「20」コースが必要な旨が含まれることを確認
  4. クリーンアップ
- **期待結果**:
  - HTTP 400
  - `{ success: false, error: "times must include all 20 courses. Missing: ...", field: "times" }`
- **スクリプト**: tc-all.js TC-342

---

## TC-343: PUT /tt/entries — 全 20 コース times が lastRecordedCourse/lastRecordedTime を設定する (issue #627)
- **URL**: PUT /api/tournaments/:id/tt/entries/:entryId
- **authRequired**: true (admin)
- **背景**: Issue #627 TC-910 修正。`/tt/entries` 経由のバルクシードは `lastRecordedCourse`/
  `lastRecordedTime` を設定しないため、overlay-events の `ta_time_recorded` イベントが
  発火しなかった。全 20 コースの `times` を受け取った際、`COURSES` の末尾コース (RR) を
  `lastRecordedCourse` に、対応する時間を `lastRecordedTime` にセットするよう修正。
- **手順**:
  1. トーナメント作成・アクティベート → TA エントリー作成
  2. `makeTaTimesForRank(1)` で全 20 コースの times を生成
  3. `apiSeedTtEntry` で PUT `/tt/entries/:entryId` に全 20 コースを送信
  4. GET `/tt/entries/:entryId` でレスポンスの `lastRecordedCourse`/`lastRecordedTime` を確認
  5. クリーンアップ
- **期待結果**:
  - `lastRecordedCourse === 'RR'` (COURSES 末尾コース)
  - `lastRecordedTime` が非空文字列
- **スクリプト**: tc-all.js TC-343

---

## TC-337: トーナメント一覧 API ページネーション — GET /api/tournaments?limit&page
- **URL**: /api/tournaments
- **authRequired**: false (公開GETエンドポイント)
- **背景**: トーナメント一覧はページネーション付き。`limit=1&page=1` で1件返り、
  `meta.total/page/limit/totalPages` が正しく返ることを確認する。
  また `page=2` が空または1件のデータを返すことも確認。
- **手順**:
  1. `?limit=1&page=1` で GET → `data.length <= 1`, `meta.limit === 1`, `meta.page === 1` を確認
  2. `?limit=1&page=2` で GET → 200 で `data.length <= 1` を確認
- **期待結果**:
  - `{ success: true, data: [...], meta: { total, page, limit, totalPages } }` の形式
  - `limit=1` のとき `data` の要素数は最大1件
  - `meta` の各フィールドが number 型

---

## TC-ARC-01: トーナメントアーカイブ API — 存在しない archive は 404
- **URL**: GET /api/tournaments/:id/archive
- **authRequired**: false (公開GETエンドポイント)
- **背景**: アーカイブは R2 の immutable bundle を読む。未生成または存在しない
  id/slug は通常トーナメントへの fallback ではなく 404 として扱う。
- **手順**:
  1. 存在しない id で `/api/tournaments/:id/archive` を GET
  2. レスポンス status と error code を確認
- **期待結果**:
  - HTTP 404
  - `error.code === 'NOT_FOUND'`
- **スクリプト**: tc-archive.js TC-ARC-01 (`npm run e2e:archive`, preview: `npm run e2e:preview:archive`)

---

## TC-ARC-02: トーナメントアーカイブ API — 未完了トーナメントの POST は拒否
- **URL**: POST /api/tournaments/:id/archive
- **authRequired**: true (admin)
- **背景**: archive bundle は完了済み大会だけを対象とする。draft/active の状態で
  admin が POST しても、未確定データを archive として保存してはいけない。
- **手順**:
  1. admin で draft tournament を作成
  2. `/api/tournaments/:id/archive` に POST
  3. レスポンス status と error code を確認
- **期待結果**:
  - HTTP 409
  - `error.code === 'CONFLICT'`
- **スクリプト**: tc-archive.js TC-ARC-02 (`npm run e2e:archive`, preview: `npm run e2e:preview:archive`)

---

## TC-ARC-03: トーナメントアーカイブ API — 完了済み公開 archive の再生成と読取
- **URL**: POST /api/tournaments/:id/archive, GET /api/tournaments/:id/archive
- **authRequired**: POST は admin、GET は公開
- **背景**: 完了済み tournament は admin POST で archive を再生成でき、公開
  `publicModes` を持つ archive は GET で mode payload と overall ranking を返す。
  preview 実行では `smkc-archives-preview` を使い、production の
  `smkc-archives` にテスト archive を書き込まない。
- **手順**:
  1. admin で tournament + BM 予選データを作成
  2. `status: completed`, `publicModes: ['bm', 'overall']` に更新
  3. `/api/tournaments/:id/archive` に POST
  4. 同じ URL を GET
  5. archive bundle の `tournament`, `modes.bm`, `overallRanking` を確認
- **期待結果**:
  - POST/GET とも HTTP 200
  - `data.archived === true`
  - `data.tournament.publicModes` に `bm` と `overall` が含まれる
  - `data.modes.bm.matches` と `data.overallRanking.rankings` が配列
- **スクリプト**: tc-archive.js TC-ARC-03 (`npm run e2e:archive`, preview: `npm run e2e:preview:archive`)

---

## TC-ARC-08: トーナメントアーカイブ API — 複数 archive の独立保存
- **URL**: POST /api/tournaments/:id/archive, GET /api/tournaments/:id/archive
- **authRequired**: POST は admin、GET は公開
- **背景**: archive 一覧は `archives/index.json` の read-modify-write に依存せず、
  R2 の軽量 `archives/by-id/*/meta.json` を優先し、既存 archive は
  `archives/by-id/*/latest.json` から再構築する。複数 tournament を連続して
  archive 化しても、後続の保存が先行 archive bundle を消してはいけない。
- **手順**:
  1. admin で 2 つの completed public BM tournament を作成
  2. それぞれ `/api/tournaments/:id/archive` に POST
  3. それぞれの `/api/tournaments/:id/archive` を GET
  4. 2 つの archive bundle が別々の tournament id/name を保持していることを確認
- **期待結果**:
  - 2 件とも POST/GET が HTTP 200
  - 2 件とも `data.archived === true`
  - 2 件の `data.tournament.id` は互いに異なる
  - archive index の補助単体テストは `archives/by-id/*/meta.json` を優先し、legacy fallback も検証する
- **スクリプト**: tc-archive.js TC-ARC-08 (`npm run e2e:archive`, preview: `npm run e2e:preview:archive`)
- **補助検証**: `smkc-score-app/__tests__/lib/tournament-archive.test.ts`

---

## TC-ARC-09: アーカイブ対応ページ — qualification data と player list の不要な直列待ち防止
- **URL**: `/tournaments/:id/ta`, `/tournaments/:id/bm`, `/tournaments/:id/mr`, `/tournaments/:id/gp`
- **authRequired**: false (公開済み mode の閲覧) / admin controls は session 依存
- **背景**: archive fallback 対応後も通常 tournament では player list が必要な
  mode data と `/api/players?limit=100` を直列取得してはいけない。qualification
  page は mode payload の `allPlayers` だけで成立する場合は重複 fetch を必須にせず、
  players endpoint を使う場合は mode response を待たずに開始する。
- **手順**:
  1. TA/BM/MR/GP の qualification page を Playwright で開く
  2. route interception で mode API の応答を保留し、`/api/players?limit=100` が出る場合はその応答も両方の request が揃うまで保留する
  3. players request が出る場合、mode API response を待たずに request が開始されることを確認
  4. players request が出ない場合、mode API の `allPlayers` payload だけで表示できることを確認
  5. players fetch が失敗した場合に mode payload の `allPlayers` が使われることを確認
- **期待結果**:
  - players API が必要な場合は mode API と並列に起動する
  - mode API 単独の `allPlayers` payload で成立する場合は、不要な追加 fetch を要求しない
  - players API 成功時は最新の player list を使う
  - players API 失敗時は archive fallback の `allPlayers` を使い、空配列に落ちても throw しない
- **スクリプト**: tc-archive.js TC-ARC-09 (`npm run e2e:archive`, preview: `npm run e2e:preview:archive`)
- **補助検証**: `smkc-score-app/__tests__/lib/qualification-page-data.test.ts`

---

## TC-ARC-06: トーナメントアーカイブ API — BM match/player payload の型付き保存
- **URL**: POST /api/tournaments/:id/archive, GET /api/tournaments/:id/archive
- **authRequired**: POST は admin、GET は公開
- **背景**: archive bundle は Prisma 由来の match / qualification / player 行を
  API fallback に再利用する。R2 保存後も `modes.bm.matches` の stage と
  `player1`/`player2` の公開 player fields が失われると、archive 経由の
  qualification/finals API が実行時 cast 依存になり壊れやすい。
- **手順**:
  1. admin で tournament + BM 予選データを作成
  2. BM 予選 match に固定スコア `score1=3`, `score2=1` を保存
  3. `status: completed`, `publicModes: ['bm', 'overall']` に更新
  4. `/api/tournaments/:id/archive` に POST
  5. 同じ URL を GET
  6. `data.modes.bm.matches[0]` の `stage`, `score1`, `score2`, `player1`, `player2` を確認
- **期待結果**:
  - HTTP 200
  - `data.modes.bm.matches[0].stage === 'qualification'`
  - `data.modes.bm.matches[0].score1 === 3`
  - `data.modes.bm.matches[0].score2 === 1`
  - `player1.id` / `player2.id` は string
  - player payload は公開 field (`name`, `nickname`) を含む
  - cleanup は tournament 削除に失敗しても player 削除まで試行し、失敗は warn に留める
- **スクリプト**: tc-archive.js TC-ARC-06 (`npm run e2e:archive`, preview: `npm run e2e:preview:archive`)

---

## TC-ARC-07: TA API — DB に tournament がない完了済み archive fallback
- **URL**: GET /api/tournaments/:id/ta
- **authRequired**: false (公開GETエンドポイント)
- **背景**: 完了済み tournament の DB 行が削除されても、公開済み archive が
  R2 に残っている場合は TA API も archive payload を返す必要がある。
  `/api/tournaments/:id/ta` は DB エラー時だけでなく、DB が正常に
  `tournament not found` を返す場合も archive fallback する。
- **手順**:
  1. `modes.ta.entries` を持つ archive fixture を用意する
  2. DB の tournament 解決が `null` を返す状態で `/api/tournaments/:id/ta` を GET
  3. `entries`, `courses`, `allPlayers` を含む archived TA payload を確認
- **期待結果**:
  - HTTP 200
  - `data.archived === true`
  - `data.entries` が archive の TA entries を返す
  - DB tournament が存在しない場合は live `TTEntry` クエリを実行しない
- **スクリプト**: tc-archive.js TC-ARC-07 (`npm run e2e:archive`, preview: `npm run e2e:preview:archive`)
- **補助検証**: `smkc-score-app/__tests__/app/api/tournaments/[id]/ta/route.test.ts`

---

## TC-ARC-04: トーナメントアーカイブ API — 公開 mode のない archive は非公開
- **URL**: GET /api/tournaments/:id/archive
- **authRequired**: false (公開GETエンドポイント)
- **背景**: archive bundle が存在しても、`publicModes` が空なら公開閲覧者に
  見せてはいけない。
- **手順**:
  1. admin で tournament を作成し `status: completed`, `publicModes: []` に更新
  2. `/api/tournaments/:id/archive` に POST して private archive bundle を生成
  3. 同じ URL を GET
  4. レスポンス status と error code を確認
- **期待結果**:
  - POST は HTTP 200
  - HTTP 403
  - `error.code === 'FORBIDDEN'`
- **スクリプト**: tc-archive.js TC-ARC-04 (`npm run e2e:archive`, preview: `npm run e2e:preview:archive`)

---

## TC-ARC-05: TA archive phase entries — phase1/phase2 round history fallback
- **URL**: GET /api/tournaments/:id/ta/phases?phase=phase1, GET /api/tournaments/:id/ta/phases?phase=phase2
- **authRequired**: false (公開GETエンドポイント)
- **背景**: 古い archive bundle は TA phase round history を持っていても
  `TTEntry.stage = phase1/phase2` の entries を持たない場合がある。この場合でも
  phase API は round history から entries を再構築し、phase1/phase2 では lives を
  0 固定として返す。
- **手順**:
  1. `modes.ta.entries` に qualification entries のみを持つ archive fixture を用意する
  2. `modes.ta.phaseRounds` に phase1 と phase2 の submitted round history を用意する
  3. `/api/tournaments/:id/ta/phases?phase=phase1` を GET
  4. `/api/tournaments/:id/ta/phases?phase=phase2` を GET
  5. phase1/phase2 の entries が round results 由来の playerId で再構築されることを確認
  6. eliminatedIds に含まれる player は `eliminated: true`、phase1/phase2 の `lives` は 0 であることを確認
- **期待結果**:
  - phase1/phase2 とも HTTP 200
  - `data.archived === true`
  - entries が round history から再構築される
  - phase1/phase2 の再構築 entries は `lives === 0`
- **補助検証**: `smkc-score-app/__tests__/app/api/tournaments/[id]/ta/phases/route.test.ts`

---

## TC-DBG-01: デバッグモードトーナメント作成 → 4モード予選スコア自動入力
- **URL**: POST /api/tournaments, POST /api/tournaments/:id/{bm,mr,gp,ta}/debug-fill
- **authRequired**: true (admin)
- **背景**: トーナメント作成時に「デバッグモード」チェックを ON にすると、
  `Tournament.debugMode = true` で保存される。各モード予選ページに admin
  限定の「予選スコア自動入力」ボタンが表示され、押下するとサーバ側で
  全試合に有効な乱数スコアが入る。preview環境でも E2E 検証用に使える。
- **手順**:
  1. admin で `POST /api/tournaments` body に `debugMode: true` を含めて作成
  2. プレイヤー 8 名追加
  3. BM/MR/GP/TA それぞれの予選 setup を実行（POST `/api/tournaments/:id/{mode}`）
  4. 各モードで `POST /api/tournaments/:id/{mode}/debug-fill` を呼ぶ
  5. 各モードの GET でスコアが入っていること、順位表が描画されることを確認
- **期待結果**:
  - 4 モードすべてで `success: true, data: { filled: N, skipped: 0 }` が返る
  - BM/MR の score1+score2 はすべて 4
  - GP の各試合で `races.length === 5`, position 重複なし
  - TA の各エントリーで `Object.keys(times).length === 20`
  - 順位表に `winRounds`/`points`/`qualificationPoints` が反映される
- **スクリプト**: tc-debug-fill.js TC-DBG-01 (`npm run e2e:debug-fill`, preview: `npm run e2e:preview:debug-fill`)

---

## TC-DBG-02: 通常モードトーナメントでは debug-fill が拒否される
- **URL**: POST /api/tournaments/:id/{bm,mr,gp,ta}/debug-fill
- **authRequired**: true (admin)
- **背景**: `debugMode = false` のトーナメントでは、admin であってもサーバが
  `403 DEBUG_MODE_DISABLED` で拒否する（誤操作・本番事故の防止）。
- **手順**:
  1. `debugMode` を **付けずに**通常トーナメントを作成
  2. プレイヤー 8 名 + 各モード予選 setup
  3. `POST /api/tournaments/:id/bm/debug-fill` を admin で呼ぶ
- **期待結果**:
  - HTTP 403, `error.code === 'DEBUG_MODE_DISABLED'`
  - 試合の score1/score2 はすべて 0 のまま
  - UI（BM/MR/GP/TA ページ）に「予選スコア自動入力」ボタンが**表示されない**
- **スクリプト**: tc-debug-fill.js TC-DBG-02 (`npm run e2e:debug-fill`, preview: `npm run e2e:preview:debug-fill`)

---

## TC-DBG-03: 既入力試合は debug-fill で上書きされない
- **URL**: POST /api/tournaments/:id/bm/debug-fill
- **authRequired**: true (admin)
- **背景**: debug-fill は「未入力試合のみ埋める」仕様。既に admin が手で入力した
  スコアや確定済み結果は保持する（idempotent な再実行を可能にする）。
- **手順**:
  1. debug トーナメント + BM 予選 setup
  2. 試合の中から 1 件だけ手動で 4-0 を入れて完了させる
  3. `POST .../bm/debug-fill` を実行
  4. レスポンス `data.filled` と `data.skipped` を確認
  5. 手で入れた試合の score1/score2 が 4-0 のまま保持されていること
- **期待結果**:
  - `data.filled` = 残り未入力試合数
  - `data.skipped` ≧ 1 （手で入れた試合 + bye 試合）
  - 手で入れた試合のスコアは保持
- **スクリプト**: tc-debug-fill.js TC-DBG-03 (`npm run e2e:debug-fill`, preview: `npm run e2e:preview:debug-fill`)

---

## TC-DBG-04: 確定済みグループは debug-fill でロックされる
- **URL**: POST /api/tournaments/:id/{bm,mr,gp}/debug-fill
- **authRequired**: true (admin)
- **背景**: 各モード `*QualificationConfirmed = true` のときは予選編集不可。
  debug-fill もこの lock に従い、409 を返してフェイルクローズする。
- **手順**:
  1. debug トーナメント + BM 予選 setup
  2. BM 予選確定 (`PUT /api/tournaments/:id` で `bmQualificationConfirmed: true`)
  3. `POST .../bm/debug-fill` を実行
- **期待結果**:
  - HTTP 409, `error.code === 'QUALIFICATION_LOCKED'`
  - 試合スコアは変更されない
- **スクリプト**: tc-debug-fill.js TC-DBG-04 (`npm run e2e:debug-fill`, preview: `npm run e2e:preview:debug-fill`)

---

## E2Eテスト実行ガイド

### セッション管理（重要）
- Playwright永続プロファイル（`/tmp/playwright-smkc-preview-profile`）にプレビュー環境用のDiscord OAuthセッションが保存されている
- E2Eは preview 専用D1にだけテストデータを作成する。本番URLを指定する場合は `E2E_ALLOW_PRODUCTION=1` を明示する
- **テスト中にログイン/ログアウトは行わない** — セッションを消費しないこと
- 認証不要TCも認証ありTCも同じセッションで連続実行する
- プレイヤー credentials ログインの検証は、管理者の永続プロファイルを壊さないよう別の一時ブラウザコンテキストで行う
- TC-107（Forbidden確認）は `https` モジュールで認証なしリクエストを送る（ブラウザセッションを使わない）
- TC-304（観覧者メッセージ）も同様に `https` で認証なしHTMLを取得して確認

### スクリプト構成
- `e2e/tc-all.js` — 全TCを1つのスクリプトで実行（セッション維持）。
  自身のインライン TC（TC-001〜TC-324 の基本機能・回帰系）を実行後、
  child process で `tc-bm.js` → `tc-mr.js` → `tc-gp.js` を逐次呼ぶ。
- `e2e/tc-bm.js` — BM 専用（TC-322 訂正、TC-501〜TC-510）
- `e2e/tc-mr.js` — MR 専用 + 共通系（TC-601〜TC-612）
- `e2e/tc-gp.js` — GP 専用（TC-701〜TC-709）

**TC ID 命名ルール**:
- TC-0xx: 公開ページ表示・ナビゲーション
- TC-1xx: 認証必須の基本機能（プレイヤーCRUD・ページネーション等）
- TC-2xx: データ読み込みとレンダリング
- TC-3xx: リグレッション・補助機能テスト（既存issue由来）
- TC-4xx: **欠番**（旧「軽量フルワークフロー」を廃止し、フル版に集約）
- TC-5xx: BMフルワークフロー（28名予選 + 決勝）
- TC-6xx: MRフルワークフロー（28名予選 + 決勝）+ MR/GP共通の決勝/予選ロック検証
- TC-7xx: GPフルワークフロー（28名予選 + 決勝）
- TC-8xx: TT(TA)フルワークフロー（28名予選 + フェーズ1〜3 決勝）— **scenario only**

**欠番 / リネーム履歴**:
- 旧 TC-323 (`tc-bm.js` のBM決勝ブラケット生成) → **TC-503** にリネーム
  （tc-all.js TC-323 と内容衝突していたため）
- 旧 tc-all.js TC-323 (BM tie warning banner) → **TC-324** にリネーム
- TC-323 は欠番（再利用しないこと）
- TC-401〜TC-404 は廃止（軽量フルワークフローおよびGPダイアログUIチェック）
- 旧 TC-816（TA/TT 決勝フェーズ — フェーズ間コース履歴引き継ぎ）は
  E2E スクリプト再整理に伴い文書上で削除。代替の回帰担保は TC-817 で実施し、
  TC-816 は別シナリオ（開始済みページのちらつきチェック）に再割当。

### ページ中身の確認ルール（重要）
E2Eテストでは以下を必ず確認すること：
1. **エラーメッセージの不在**: `Failed to fetch`, `500`, `再試行` が表示されていないこと
2. **コンテンツの存在**: トーナメント名、モード名、ボタン等が実際に表示されていること
3. **ローディング完了**: `読み込み中` が消えていること

HTTPステータスコード200だけでは不十分。ページの`innerText`を取得して上記を検証すること（`textContent`はi18n JSONを含むため使用不可）。

## 未カバー領域のテストケース（調査後追加）

### TC-820: MR match/[matchId] ページ view-only確認 ✅ FIXED (PR #407)
- ~~MR matchページはadminでもスコア入力フォームが見えていた~~
- **修正内容**: MR match detailページのスコア入力フォームは参加者専用。管理者は `/mr/participant` ページを使用。
- **PR**: https://github.com/azumag/JSMKC/pull/407

### TC-821: GP match/[matchId] ページ view-only確認 ✅ FIXED (PR #407)
- ~~GP matchページはadminでもスコア入力フォームが見えていた~~
- **修正内容**: GP match detailページのスコア入力フォームは参加者専用。管理者は `/gp/participant` ページを使用。
- **PR**: https://github.com/azumag/JSMKC/pull/407

### TC-822: MR二重報告 — 管理者確定後のスコア変更不可 ✅ FIXED (issue #2076)
- **URL**: /api/tournaments/[temp-id]/mr/match/[matchId]/report (POST)
- **authRequired**: true (admin)
- **背景**: MR dual report の mismatch を管理者が確定した後は、参加者からの再報告で確定済みスコアを上書きできない
- **現状**: MRMatch に `scoresConfirmed` を保持し、match detail PUT で true にされた後の report POST は 400 で拒否される
- **tc-mr.js 内位置**: `runTc822` 関数、テストスイート登録は TC-822
- **対応**: `smkc-score-app/e2e/tc-mr.js` と API route/unit test で回帰を検出

### TC-820/821 実装確認 ✅ FIXED (PR #407)
- TC-820 (`runTc820` in tc-mr.js): MR match detail page view-only test
- TC-821 (`runTc821` in tc-gp.js): GP match detail page view-only test
- tc-mr.js と tc-gp.js で実行済み。PR #407 で MR/GP スコア入力フォームが admin から隠蔽された

### TC-316/322/324 文書化 ✅ ADDED (本PR)
- TC-316 (`e2e/tc-all.js` 行 1172-1280): BM 同順位バー抑制 regression test（mp=0非表示、マッチ後表示）
- TC-322 (`e2e/tc-bm.js` 行 148-223): BM スコア修正（Correct Score UI）テスト
- TC-324 (`e2e/tc-all.js` 行 1565): BM rankOverride 設定後の同城バー消滅テスト
- 上記3TCは実装済みだったが E2E_TEST_CASES.md に文書化が漏れていたため追加

### TC-518: 2P予選 同着プレーオフ結果記録
- **対象**: BM / MR / GP qualification standings
- **前提**: 1グループ内で primary criteria と H2H 後も同順位が残ること
- **手順**:
  1. 同順位バナーと「プレーオフ結果を記録」導線が表示されることを確認
  2. ダイアログで tied players を並べ替え、保存する
  3. 保存後、対象 tie block に連番の `rankOverride` が入り、警告バナーが消えることを確認
  4. 画面再読込後も順位順が維持されることを確認
- **備考**: 既存の `resolveAllTies()` ヘルパーで API 層の結果整合性を継続検証し、UI regression は後続の focused suite に追加する

### TC-802 実装済み
- TC-802 TAプレイヤーログインからタイム入力: `tc-ta.js` に実装済み（player login → `/ta/participant` 入力送信 → TT entry 永続化確認）

### TC-803 統合済み
- TC-803 TAペア機能: TC-318 で既にカバー済みのため統合

### TC-108 実装済み
- TC-108 Players API ページネーション: `tc-all.js` に API 契約 + limit clamp + `/players` ページャー可視性チェックを追加

### TC-510 実装済み
- TC-510 BM Top-24 バラージ（Pre-Bracket Playoff）: `tc-bm.js` に `topN: 24` の playoff 作成、2グループ手書き紙配置、未完了409、R1→R2ルーティング、R2完了、Top-16 finals 生成、Upper Bracket バラッジ枠割当チェックを追加

### TC-515: BM Top-24 Playoff UI Flow（sessionStorage + PlayoffBracket + Upper Bracket）
- **URL**: /tournaments/[temp-id]/bm → /bm/finals
- **authRequired**: true (admin)
- **背景**: `feat(qualification): show split Go to Finals buttons when players > 16` と `fix(qualification): pass topN to finals via sessionStorage` で、予選ページに「Start Playoff (Top 24)」ボタンが追加され、クリック時に `sessionStorage` に `bm_finals_topN=24` が保存される
- **手順**:
  1. 28名予選完了後、`/bm` を開く
  2. 「Start Playoff (Top 24)」ボタンが表示されることを確認
  3. クリック後、`sessionStorage.getItem('bm_finals_topN') === '24'` であることを確認
  4. `/bm/finals` に遷移し、「Playoff (Barrage)」ラベルと M1〜M8 の PlayoffBracket が表示されることを確認
  5. playoff_r1 M1〜M4 をスコア入力（5-0）
  6. playoff_r2 M5〜M8 をスコア入力（5-0）→ `playoffComplete=true` を確認
  7. Phase 2 POST で Upper Bracket 生成 → `phase='finals'` に切り替わることを確認
  8. クリーンアップ
- **期待結果**: Top-24 のUIフロー（ボタン→sessionStorage→PlayoffBracket→Upper Bracket生成）が正しく動作する
- **実装**: `tc-bm.js` `runTc515`

### TC-516: BM 予選ページ finals-exists 状態 + Reset Bracket
- **URL**: /tournaments/[temp-id]/bm
- **authRequired**: true (admin)
- **背景**: 決勝ブラケット生成後、予選ページに戻ると「View Tournament」ボタンに切り替わる。admin の「Reset Bracket」ボタンは予選ロック中は非表示で、予選ロック解除後のみ表示される
- **手順**:
  1. 8名決勝ブラケットを生成
  2. `/bm` に戻り、「View Tournament」が表示され、「Reset Bracket」ボタンは表示されないことを確認
  3. 予選ロックを解除し、「Reset Bracket」ボタンが表示されることを確認
  4. 「Reset Bracket」をクリック（confirmダイアログをaccept）
  5. 予選が未ロックの間は「Generate Finals Bracket」ボタンが復帰しないことを確認
  6. クリーンアップ
- **期待結果**: finalsExists 状態の切り替え、ロック解除時だけのリセット表示、リセット後の未ロック状態がUI上で正しく動作する
- **実装**: `tc-bm.js` `runTc516`

### TC-518: TV Assignment up to 4
- **URL**: /tournaments/[temp-id]/bm
- **authRequired**: true (admin)
- **背景**: `fix: allow TV assignment up to 4` で放送割当TV番号が1〜4まで拡張された
- **手順**:
  1. 28名BM予選完了後、`/bm` を開く
  2. マッチ行のTV割当 `<select>` に option 1,2,3,4 が存在することを確認
  3. TV 4 を選択し、API GET で `tvNumber=4` が永続化されていることを確認
  4. クリーンアップ
- **期待結果**: TV割当が1〜4まで可能で、選択値が永続化される
- **実装**: `tc-all.js` `runTc518`

### TC-615: MR Top-24 Playoff UI Flow
- **URL**: /tournaments/[temp-id]/mr → /mr/finals
- **authRequired**: true (admin)
- **背景**: BMと同様のTop-24→Top-16 playoffフロー。`mr_finals_topN=24` を sessionStorage に保存
- **手順**:
  1. 28名MR予選完了後、`/mr` を開く
  2. 「Start Playoff (Top 24)」ボタンをクリック
  3. `sessionStorage.getItem('mr_finals_topN') === '24'` を確認
  4. `/mr/finals` で PlayoffBracket M1〜M8 が表示されることを確認
  5. playoff_r1/r2 をスコア入力（3-0、MR targetWins=3）
  6. Phase 2 で Upper Bracket 生成 → finals phase に切り替わることを確認
  7. クリーンアップ
- **期待結果**: MRでもTop-24 playoff UIフローが正しく動作する
- **実装**: `tc-mr.js` `runTc615`

### TC-616: MR 予選ページ finals-exists 状態 + Reset Bracket
- **URL**: /tournaments/[temp-id]/mr
- **authRequired**: true (admin)
- **手順**:
  1. 8名決勝ブラケットを生成
  2. `/mr` に戻り、「View Tournament」が表示され、「Reset Bracket」は表示されないことを確認
  3. 予選ロックを解除し、「Reset Bracket」が表示されることを確認
  4. Reset 後、予選が未ロックの間は「Generate Finals Bracket」に戻らないことを確認
  5. クリーンアップ
- **期待結果**: MRでもfinalsExists状態と、ロック解除時だけのリセット表示が正しく動作する
- **実装**: `tc-mr.js` `runTc616`

### TC-715: GP Top-24 Playoff UI Flow
- **URL**: /tournaments/[temp-id]/gp → /gp/finals
- **authRequired**: true (admin)
- **背景**: GPでもTop-24→Top-16 playoffフロー。
- **手順**:
  1. 28名GP予選完了後、`/gp` を開く
  2. 「Start Playoff (Top 24)」ボタンが表示されることを確認
  3. `POST /api/tournaments/[id]/gp/finals { topN: 24 }` で Top-24 Playoff を生成
  4. `/gp/finals` で PlayoffBracket M1〜M8 が表示されることを確認
  5. playoff_r1/r2 を playoff のFT1カップ勝利数でスコア入力
  6. Phase 2 で Upper Bracket 生成 → finals phase に切り替わることを確認
  7. クリーンアップ
- **期待結果**: GPでもTop-24 playoff UIフローが正しく動作する
- **実装**: `tc-gp.js` `runTc715`

### TC-716: GP 予選ページ finals-exists 状態 + Reset Bracket
- **URL**: /tournaments/[temp-id]/gp
- **authRequired**: true (admin)
- **手順**:
  1. 8名決勝ブラケットを生成
  2. `/gp` に戻り、「View Tournament」が表示され、「Reset Bracket」は表示されないことを確認
  3. 予選ロックを解除し、「Reset Bracket」が表示されることを確認
  4. Reset 後、予選が未ロックの間は「Generate Finals Bracket」に戻らないことを確認
  5. クリーンアップ
- **期待結果**: GPでもfinalsExists状態と、ロック解除時だけのリセット表示が正しく動作する
- **実装**: `tc-gp.js` `runTc716`

### TC-317/319/807/808 文書化 ✅ ADDED
- TC-317 (`e2e/tc-all.js` 行 828-877): TA シーディング CRUD — update_seeding が TTEntry に永続化される
- TC-319 (`e2e/tc-all.js` 行 972-1047): TA taPlayerSelfEdit フラグ toggle — false でセルフ編集ブロック
- TC-807 (`e2e/tc-ta.js` 行 277-379): TA Phase 3 ページが16名のエントリーを表示する
- TC-808 (`e2e/tc-ta.js` 行 381-472): TA Finals チャンピオン決定時にプロデューサーバナーが表示される
- 上記4TCは実装済みだったが E2E_TEST_CASES.md に文書化が漏れていたため追加

### TC-320/321 文書化 ✅ ADDED
- TC-320 (`e2e/tc-all.js` 行 1282-1311): BM/MR/GP マッチリスト行レベルスコア入力リンク非表示化regression
- TC-321 (`e2e/tc-all.js` 行 1314-1419): BM match/[matchId] ページ view-only regression
- TC-320/321 は PR #407 の TC-820/821 対応に伴う regression テスト。実装済みだが文書化されていなかったため追加

### TC-347/348/349 文書化 ✅ ADDED
- TC-347 (`e2e/tc-all.js`): Export API — GET /api/tournaments/:id/export が text/csv を返すこと
- TC-348 (`e2e/tc-all.js`): Character stats API — admin は 200+stats shape、未認証は 401 を返すこと
- TC-349 (`e2e/tc-all.js`): Responsive — BM/MR/GP 予選ページが 375px モバイルビューポートで JS エラーなく表示されること

## 未カバー領域のテストケース（調査後追加）

### スコアエントリーログAPI (score-entry-logs)
- **URL**: `/api/tournaments/[temp-id]/score-entry-logs`
- **authRequired**: true (admin)
- **背景**: すべてのスコア入力の監査証跡を管理者に提供するAPI
- **手順**:
  1. 管理者のセッションで BM/MR/GP のスコアを入力する
  2. `GET /api/tournaments/[temp-id]/score-entry-logs` を呼び出す
  3. `logsByMatch` に各マッチのスコア入力履歴が含まれることを確認する
  4. 非管理者セッションでは403が返ること
  5. クリーンアップ
- **期待結果**: 監査ログがマッチ単位で整理されて返される

### Export API (CSV download)
- **URL**: `/api/tournaments/[temp-id]/export`
- **authRequired**: false (public)
- **背景**: 全モードのデータをCSVとしてエクスポートできる
- **手順**:
  1. テストトーナメントでTA/BM/MR/GPのデータを入力する
  2. `GET /api/tournaments/[temp-id]/export` を呼びCSVファイルをダウンロードする
  3. CSVに正しいデータが含まれていることを確認する
  4. クリーンアップ
- **期待結果**: UTF-8 BOM付きCSVがダウンロードされ、Excelで正常に表示される

### キャラクター統計API (character-stats)
- **URL**: `/api/players/[playerId]/character-stats`
- **authRequired**: true (admin)
- **背景**: プレイヤーのキャラクター使用統計（使用回数、勝率等）を提供するAPI
- **手順**:
  1. 管理者のセッションでキャラクターを使用したマッチを入力する
  2. `GET /api/players/[playerId]/character-stats` を呼び出す
  3. `characterStats` にキャラクター別の勝率が含まれることを確認する
  4. 非管理者セッションでは403が返ること
  5. クリーンアップ
- **期待結果**: キャラクター別の matchCount, winCount, winRate が返される

### Profile ページ
- **URL**: `/profile`
- **authRequired**: true (player credentials)
- **背景**: プレイヤーセッション相关信息を表示するページ
- **手順**:
  1. プレイヤーとしてログインする
  2. `/profile` ページにアクセスする
  3. ユーザー情報（name, email, role）とプレイヤー関連情報（nickname, country）が表示されることを確認する
  4. クリーンアップ
- **期待結果**: セッション情報とプレイヤー情報が正しく表示される

### BM 進行中マッチページ guidance (Issue #568)
- **URL**: `/tournaments/[temp-id]/bm/match/[matchId]`
- **authRequired**: false (view public, CTA requires auth)
- **背景**: 進行中のBM shared matchページで参加者向けスコア入力ページへの導線を表示
- **手順**:
  1. 進行中のBMマッチを持つトーナメントで参加プレイヤーとしてログインする
  2. 直接 `/bm/match/[matchId]` URLにアクセスする
  3. 進行中メッセージと「Go to Score Entry」ボタンが表示されることを確認
  4. 未認証ユーザーの場合は「Sign in to report scores」メッセージが表示されること
  5. クリーンアップ
- **期待結果**: 進行中マッチページにスコア入力導線が適切に表示される

### MR/GP 進行中マッチページのスコア入力UI
- **URL**: `/tournaments/[temp-id]/mr/match/[matchId]`, `/tournaments/[temp-id]/gp/match/[matchId]`
- **authRequired**: true (player or admin)
- **背景**: MR/GP match detailページでは参加者によるスコア入力が可能
- **手順**:
  1. MR/GPの進行中マッチを持つトーナメントで参加プレイヤーとしてログインする
  2. 直接 `/mr/match/[matchId]` URLにアクセスする
  3. スコア入力UIが表示されることを確認
  4. 同様のテストをGPマッチページでも実施する
  5. クリーンアップ
- **期待結果**: MR/GP match detailページではスコア入力UIが利用可能

### TA Phase 1/Phase 2 リダイレクト
- **URL**: `/tournaments/[temp-id]/ta/phase1`, `/tournaments/[temp-id]/ta/phase2`
- **authRequired**: true (admin)
- **背景**: TA总决赛のフェーズ別ページが正しくコンポーネントを表示
- **手順**:
  1. TA总决赛を開始しPhase 1/Phase 2に移動する
  2. `/ta/phase1` ページでノックアウトテーブルが表示されることを確認
  3. `/ta/phase2` ページで同じ形式的表示がされることを確認
  4. クリーンアップ
- **期待結果**: Phase 1/Phase 2 обеでTA排除コンポーネントが正しく描画される

### Revivial-1/Revivial-2 リダイレクト
- **URL**: `/tournaments/[temp-id]/ta/revival-1`, `/tournaments/[temp-id]/ta/revival-2`
- **authRequired**: true (admin)
- **背景**: 旧URLが新しいフェーズURLにリダイレクトされる
- **手順**:
  1. `/ta/revival-1` にアクセスする
  2. `/ta/phase1` にリダイレクトされることを確認
  3. 同様のテストを revival-2 → phase2 として実施する
- **期待結果**: 旧URLが新しいURLに正しくリダイレクトされる

### Polling / Real-time updates
- **URL**: 全モードページ (BM, MR, GP, TA)
- **authRequired**: false
- **背景**: 各モードページは3秒間隔で自動更新し、マッチ状態変化するたびにUIが更新される
- **手順**:
  1. 進行中のマッチを持つBMページを開く
  2. 別セッションでスコアを投票する
  3. 3秒以内にUIが更新され、マッチの状態が変わることを確認する
  4. MR、GP、TAのページでも同様に polling が動作することを確認する
- **期待結果**: すべてのモードで3秒間隔のpollingが動作し、リアルタイム更新される

### セッション状態API
- **URL**: `/api/auth/session-status`
- **authRequired**: false
- **背景**: 現在のセッション状態を確認するAPI
- **手順**:
  1. 認証なしのリクエストで `/api/auth/session-status` を呼び出す
  2. セッション状態情報（authenticated, user type等）が返ること
  3. プレイヤーとしてログイン后再リクエストし、sessionが更新されることを確認
- **期待結果**: セッション状態が正しく返される

---

### TC-901: Overlay Events API は無認証で 200 を返す
- **URL**: `/api/tournaments/[id]/overlay-events`
- **authRequired**: false
- **背景**: OBS ブラウザソース用のオーバーレイがCookieを持たずに叩く想定
- **手順**:
  1. Node `https.get` で `/api/tournaments/[id]/overlay-events` を叩く
  2. レスポンスが `{ success: true, data: { serverTime: ISO, events: [] } }` であること
  3. レスポンスヘッダ `Cache-Control` に `no-store` が含まれること
- **期待結果**: 200 / 期待形 / no-store

### TC-902: Overlay Events に PII が含まれない
- **背景**: ScoreEntryLog など機微フィールド（ipAddress / userAgent / userId / password / email）が公開エンドポイントから漏れないこと
- **手順**:
  1. 管理 API でスコアを 1 件 PUT し、event を発生させる
  2. `since=1970-01-01T00:00:00.000Z` で overlay-events を取得
  3. レスポンス JSON ツリーを再帰的に走査して禁止キーが無いことを検証
- **期待結果**: events 配列に少なくとも 1 件、かつ禁止キーが 1 つも見つからない

### TC-903: スコア入力 → match_completed イベントが流れる
- **背景**: 管理 API が試合スコアを完成させたとき、無認証 poller がそれを観測できる
- **手順**:
  1. 2 名 1 グループの BM 予選試合を作成（API のみ）
  2. `apiPutBmQualScore(..., 4, 0)` で試合を完了
  3. 無認証 GET でポーリングし、`type='match_completed'`, `mode='bm'`, `subtitle` に "4-0", `title` に完了を示す文言が含まれるイベントが現れること
- **期待結果**: 15 秒以内にイベントが取得できる

### TC-904: `since` クエリで未来日時を渡すと events は空配列
- **背景**: クライアントが `serverTime` をエコーバックして差分のみ取る前提
- **手順**:
  1. `since=<now+60s>` で overlay-events を叩く
  2. `events: []` であること
- **期待結果**: 空配列で返る（200 維持）

### TC-905: Overlay HTML ページが無認証で表示される
- **URL**: `/tournaments/[id]/overlay`
- **authRequired**: false
- **背景**: OBS のブラウザソース URL に貼って動くこと
- **手順**:
  1. Node `https.get` で HTML を取得
  2. ステータスが 200
  3. レスポンスボディに `data-testid="overlay-root"` が含まれる
- **期待結果**: ページが描画される（認証で弾かれない）

### TC-906: 実ブラウザで Overlay にトーストが描画される（E2E）
- **背景**: SSR（TC-905）はシェルが返るだけ。SSR → hydrate → poll → animate のフロー全体を検証する
- **手順**:
  1. Playwright で `/tournaments/[id]/overlay` を開く
  2. `[data-testid="overlay-root"]` が hydrate するのを待つ
  3. 15 秒以内に `[data-testid="overlay-toast"]` が DOM に出現
  4. スタック全体のテキストに更新・確定・完了・開始・申告・タイム系タイトルのいずれかが含まれる。ただし英語の `Time` 単独では汎用的すぎるため、`Time Attack` のような具体的なタイトル語だけを許可する
- **期待結果**: 実ブラウザでトーストが表示される
- **備考**: 各イベント種別の中身は TC-903/907/908/910/909 等で個別に検証しているため、TC-906 はパイプライン疎通のみを担当

### TC-907: MR の `match_completed` イベント
- **手順**: MR 予選試合に admin PUT (3-1) → unauth poll で `type='match_completed'`, `mode='mr'`, subtitle に `3-1`, title に完了を示す文言を含むイベントが現れる
- **期待結果**: 15 秒以内に取得できる

### TC-908: GP の `match_completed` イベント（points→score リマップ検証）
- **背景**: GP は DB 上 `points1/points2`（ドライバーポイント）、route で `score1/score2` にリマップしてから aggregator に渡す。この経路を E2E で確認
- **手順**: GP 予選試合の cup を取得 → `makeRacesP1Wins(cup)` で 5 レースの結果を生成 → admin PUT → unauth poll で `mode='gp'` の `match_completed` イベント
- **期待結果**: subtitle に `45-0`（5×9pts）形式のスコア、title に完了を示す文言を含む

### TC-909: `qualification_confirmed` イベント
- **手順**: PUT `/api/tournaments/[id]` `{ qualificationConfirmed: true }` → unauth poll で `type='qualification_confirmed'`, title に `予選確定` または `Qualification Locked`
- **期待結果**: イベントが現れる
- **備考**: このフラグ ON 後は予選スコア編集が拒否されるため、score 系 TC の後に実行すること

### TC-910: `ta_time_recorded` イベント（予選＝合計タイム通知）
- **背景**: 予選は 20 コース × N 名分のスコア更新が発生するため、コースごとに通知すると過剰になる。予選ステージは `totalTime` が確定したタイミング（全 20 コース入力済み）で 1 回のみ発火する設計
- **手順**: 全 20 コース分の time map（`makeTaTimesForRank`）+ totalTime + rank を `apiSeedTtEntry` で 2 エントリに投入 → unauth poll で `type='ta_time_recorded'`, `mode='ta'`
- **期待結果**:
  - イベントが現れる
  - title が予選完走を示す形式（例: `[予選] {nickname} が予選を完走しました...` または `[Qualification] {nickname} completed Qualification...`）
  - `taTimeRecord` payload は `{ player, phaseLabel, rank, totalTimeMs, totalTimeFormatted }` を持ち、`course`/`time` は含まれない
- **備考**: PUT 経路の `recalculateRanks` が times から totalTime を再計算するため、部分的な time map（例: 4 コースだけ）だと totalTime=null になり予選通知は発火しない（敗者復活/決勝などの phase ステージは引き続きコースごとに通知）

### TC-911: `overall_ranking_updated` イベント
- **手順**: POST `/api/tournaments/[id]/overall-ranking`（空 body）→ unauth poll で `type='overall_ranking_updated'`
- **期待結果**: イベントが現れる

### TC-913: `ta_phase_advanced` イベント
- **手順**: TA 予選 totalTime + rank を 2 エントリに投入（TC-910 で済） → POST `/ta/phases` `{action:'promote_phase3'}` → POST `{action:'start_round', phase:'phase3'}` → unauth poll で `type='ta_phase_advanced'`, title に `phase3` または `Phase 3`
- **期待結果**: イベントが現れる
- **備考**: 2 名なら top-12（phase3）に両者が入り、`start_round` で TTPhaseRound が作成される。phase1/2 は ranks 17-24 / 13-16 を必要とするため小規模では skip される

### TC-914: `score_reported` イベント（プレイヤー /report 経由）
- **手順**:
  1. 大会作成時に `dualReportEnabled=true` を有効化（自動確定を防ぎ、ScoreEntryLog のみが書かれる状態を作る）
  2. 別ブラウザで対象プレイヤーとしてログイン
  3. POST `/api/tournaments/[id]/bm/match/[matchId]/report` `{ reportingPlayer: 1, score1: 3, score2: 1 }`
  4. unauth poll で `type='score_reported'`, `mode='bm'`, subtitle にプレイヤー nickname
- **期待結果**: イベントが現れる
- **備考**: 試合が完了状態（completed=true）になると /report は拒否されるため、admin PUT による match_completed テスト（TC-902）の前に実行すること

### TC-912 (`finals_started`): E2E スキップ
- **理由**: BM finals POST は `topN ∈ {8, 16, 24}`（finals-route.ts L696）を要求するため、自己完結 fixture（2 名）では到達不能。`__tests__/lib/overlay/events.test.ts` の単体テストでアグリゲータ経路を検証

### TC-916: PUT /broadcast — 1P/2P 名前の設定と読み取り (issue #635)
- **手順**: `PUT /api/tournaments/[id]/broadcast { overlayPlayer1Name, overlayPlayer2Name }` → `GET /broadcast` でフィールドが返ること
- **期待結果**: PUT が 200 を返し、GET レスポンスに `overlayPlayer1Name` / `overlayPlayer2Name` が含まれる
- **スクリプト**: tc-overlay.js TC-916

### TC-917: overlay-events に broadcast プレイヤー名が含まれる (issue #635)
- **手順**: TC-916 で名前を設定後、`GET /overlay-events?initial=1` を呼び出す
- **期待結果**: レスポンスに `overlayPlayer1Name` と `overlayPlayer2Name` が含まれ空でない
- **スクリプト**: tc-overlay.js TC-917

### TC-918: PUT /broadcast — matchLabel/wins/ft の設定と読み取り (#644/#645/#649)
- **手順**: `PUT /api/tournaments/[id]/broadcast { matchLabel, player1Wins, player2Wins, matchFt }` → `GET /broadcast` でフィールドが返ること
- **期待結果**: PUT が 200 を返し、GET レスポンスに `matchLabel` / `player1Wins` / `player2Wins` / `matchFt` が含まれる
- **スクリプト**: tc-overlay.js TC-918

### TC-919: overlay-events に broadcast マッチ情報フィールドが含まれる (#644/#645/#649)
- **手順**: TC-918 で matchLabel/wins/ft を設定後、`GET /overlay-events?initial=1` を呼び出す
- **期待結果**: レスポンスに `overlayMatchLabel` / `overlayPlayer1Wins` / `overlayPlayer2Wins` / `overlayMatchFt` が含まれる
- **スクリプト**: tc-overlay.js TC-919

### TC-920: ダッシュボードページが matchLabel とスコアを実ブラウザで描画する (#644/#645/#649)
- **手順**: TC-918/919 で matchLabel/wins/ft をセット後、Playwright で `/overlay/dashboard` を開き 8 秒待機
- **期待結果**: `dashboard-footer` に matchLabel テキスト、`dashboard-footer-ft` に FT 数値バッジ、`overlay-p1-score` / `overlay-p2-score` が表示される
- **スクリプト**: tc-overlay.js TC-920

### TC-921: ダッシュボードタイムラインがイベントエントリーとスコアボードカードを描画する
- **背景**: DashboardTimeline コンポーネントは `/overlay/dashboard` の右パネルに配置される。TC-903/907/908 が作成した match_completed イベントが `?initial=1` バックフィルで取得されること、および match 系イベントが `dashboard-timeline-scoreboard` カードとして描画されることを検証する
- **手順**:
  1. Playwright で `/tournaments/[id]/overlay/dashboard` を開く
  2. `dashboard-root` が hydrate するのを待つ（8 秒待機）
  3. `dashboard-timeline` 要素が存在すること
  4. `dashboard-timeline-entry` カードが 1 件以上存在すること
  5. `dashboard-timeline-scoreboard` カード（match_completed イベント用リッチ表示）が 1 件以上存在すること
- **期待結果**: タイムラインがレンダリングされ、スコアボードカードが表示される
- **スクリプト**: tc-overlay.js TC-921

### TC-922: ダッシュボードプログレスバーが描画される
- **背景**: DashboardProgressBar は常に `/overlay/dashboard` の右パネルの最上部に表示され、現在フェーズ（予選 → バラッジ → 決勝）をステップインジケータで示す
- **手順**: TC-921 で開いたダッシュボードページで `dashboard-progress-bar` 要素の存在を確認する
- **期待結果**: `dashboard-progress-bar` 要素が DOM に存在する
- **スクリプト**: tc-overlay.js TC-922

### TC-923: ダッシュボードタイムラインが TA タイムカードを描画する
- **背景**: TC-910 が TA エントリーに全 20 コースのタイムを投入すると `ta_time_recorded` イベントが発生する。このイベントはタイムラインで `dashboard-timeline-ta-time` リッチカードとして描画される（合計タイム・順位バッジ付き）
- **手順**: TC-921 で開いたダッシュボードページで `dashboard-timeline-ta-time` 要素の存在を確認する
- **期待結果**: `dashboard-timeline-ta-time` カードが 1 件以上存在する
- **スクリプト**: tc-overlay.js TC-923

### TC-924: ダッシュボードのマッチ通知に BM/MR のコース名と GP のカップ名が表示される
- **背景**: OBS ダッシュボード (`/overlay/dashboard`) の `match_completed` 通知では、視聴者がどのコース・カップで行われた試合かを判別できるよう、BM/MR ではコース名（`assignedCourses` の配列）、GP ではカップ名（`cup`）も表示する必要がある
- **Given (前提)**:
  1. BM 予選試合 (`assignedCourses` を持つ) が完了している (TC-903 で 4-0 で完了済み)
  2. MR 予選試合 (`assignedCourses` を持つ) が完了している (TC-907 で 3-1 で完了済み)
  3. GP 予選試合 (`cup` を持つ) が完了している (TC-908 で完了済み)
- **When (操作)**:
  1. 無認証で `GET /api/tournaments/[id]/overlay-events?initial=1` を呼び出す
  2. Playwright で `/overlay/dashboard` を開き 8 秒待機する
- **Then (期待結果)**:
  1. API レスポンスの BM/MR `match_completed` イベントの `matchResult` に `courses` 配列（4 要素以上の文字列配列）が含まれる
  2. API レスポンスの GP `match_completed` イベントの `matchResult` に `cup` 文字列フィールドが含まれる
  3. ダッシュボードのスコアボードカード (`dashboard-timeline-scoreboard`) のテキストに、BM/MR ならコース略称（例: `MC1`）が、GP ならカップ名（例: `Mushroom`）が含まれる
- **エッジケース**:
  - `assignedCourses` が null/空配列の場合（旧データ）はカードにコース行が描画されない（コース行非表示でクラッシュしない）
  - `cup` が null の場合（旧データ）はカードにカップ行が描画されない
- **スクリプト**: tc-overlay.js TC-924

### TC-925: ダッシュボードタイムラインが TA 予選 完走カードを描画する（合計タイム表示）
- **背景**: TA 予選通知をコースごとから合計タイム単位に変更したため、ダッシュボードのカードも合計タイム見出し+大きな M:SS.cc 表示に切り替わった。TC-923 はカードの存在のみを検証するが、TC-925 はそれが新しい総合タイム版であることを保証する
- **手順**: TC-921 で開いたダッシュボードページで `dashboard-timeline-ta-total` 要素の存在を確認し、テキストが `M:SS.cc` フォーマット（例: `1:30.00`）に一致することを検証する
- **期待結果**: `dashboard-timeline-ta-total` 要素が 1 件以上存在し、テキストが `^\d+:\d{2}\.\d{2}$` に一致する
- **スクリプト**: tc-overlay.js TC-925

### TC-926: 配信管理の座標指定が dashboard の名前・点数・下枠位置へ反映される
- **背景**: 配信管理者が OBS シーンに合わせて 1P/2P 名、点数、下枠ラベルの表示位置を微調整できる必要がある
- **手順**:
  1. `PUT /api/tournaments/[id]/broadcast` で `layout.player1Name/player1Score/player2Name/player2Score/footer` の 0–1920/0–1080 内の x/y 座標を設定する
  2. `GET /broadcast` と `GET /overlay-events?initial=1` で同じ `layout` が返ることを確認する
  3. Playwright で `/overlay/dashboard` を開き、`overlay-p1-name` / `overlay-p1-score` / `overlay-p2-name` / `overlay-p2-score` / `dashboard-footer-slot` の computed `left/top` が設定座標になることを確認する
- **期待結果**: API と実ブラウザ dashboard の両方に座標指定が反映される
- **スクリプト**: tc-overlay.js TC-926

### TC-927: overlay toast の既知タイトル語を網羅的に許可する (issue #1001)
- **背景**: TC-906 は toast スタック内のタイトル語で overlay の疎通を確認するため、`OVERLAY_TOAST_TITLE_PATTERN` の各 alternation が regress すると実ブラウザ疎通テストが誤検知する
- **手順**:
  1. `hasKnownOverlayToastTitle` に日本語タイトル語（更新・確定・終了・申告・タイム）を渡す
  2. `hasKnownOverlayToastTitle` に英語タイトル語（Updated・Locked・Completed・Started・Reported・Qualification・Ranking・Time Attack）を渡す
  3. 汎用的すぎる `Time` 単独は拒否されることを確認する
- **期待結果**: overlay が実際に使うタイトル語はすべて true、`Time` 単独は false
- **スクリプト**: tc-overlay.js TC-927 / `__tests__/e2e/overlay-toast-assertions.test.ts`

### TC-1002: overlay toast helper テストを同期 require で読み込む (issue #1002)
- **URL**: n/a (unit/static coverage)
- **authRequired**: false
- **背景**: `e2e/lib/overlay-toast-assertions.js` は CommonJS helper であり、Jest 側の契約テストは非同期初期化を必要としない。`beforeAll(async)` + dynamic `import()` を残すと、単なる CJS helper 読み込みに不要な Promise 境界が入り、テストの失敗点と保守コストが増える。
- **手順**:
  1. `__tests__/e2e/overlay-toast-assertions.test.ts` を確認する
  2. CommonJS helper をファイル先頭の `require()` で読み込んでいることを確認する
  3. `beforeAll(async ...)` と `await import(...)` が残っていないことを確認する
  4. 既知タイトル語と拒否タイトル語の単体テストが従来通り実行されることを確認する
- **期待結果**: overlay toast helper のテストは同期 `require()` で簡潔に初期化され、タイトル許可/拒否の回帰検知は維持される
- **スクリプト**: `npm test -- --runTestsByPath __tests__/e2e/overlay-toast-assertions.test.ts __tests__/static/tc-1002-overlay-toast-require-contract.test.ts`

### TC-939: トーナメントタブの SPA ルーティングを維持して prefetch だけ抑止する
- **URL**: /tournaments/[id]/ta
- **authRequired**: true (admin profile)
- **背景**: トーナメントタブを plain `<a>` にすると Next.js のクライアントサイドルーティングが失われ、タブ切替のたびに全ページリロードが発生する。`Link prefetch={false}` なら speculative prefetch による D1 読み取りは抑止しつつ、SPA ナビゲーションは維持できる。
- **手順**:
  1. テスト用トーナメントの `/ta` ページを開く
  2. ブラウザ上に reload で失われる marker を設定する
  3. タブバーの hydration 完了シグナルを待つ
  4. hydrated 後のタブ className に余分な前後空白や連続空白がないことを確認する
  5. トーナメントタブから BM ページへ移動する
  6. URL が `/bm` に変わり、marker が残っていることを確認する
- **期待結果**: タブクリックは full document reload ではなく SPA navigation として完了し、hydrated 後のタブ className に guard 由来の余分な空白が残らない。両方の失敗条件が同時に発生した場合は、reload と className の両方の理由を同じ TC-939 ログに出力する
- **スクリプト**: tc-all.js TC-939 / `__tests__/e2e/tc-939-reporting.test.ts` / `__tests__/lib/tc939-reporting.test.ts` / `__tests__/static/tc-939-tournament-tabs-link.test.ts`

### TC-2040: TA phases の sequential D1 読み込みコメントが観測根拠を保持する
- **URL**: `/api/tournaments/[id]/ta/phases?phase=phase1`
- **authRequired**: false (static/unit coverage)
- **背景**: issue #2040。TA phases API の D1 読み込み設計（`Promise.all` を使わず sequential を採用）を保守的に維持しつつ、観測された request-hung の歴史的背景を将来のリグレッション検知に反映する。
- **手順**:
  1. `src/app/api/tournaments/[id]/ta/phases/route.ts` の sequential D1 読み込みコメントを確認する
  2. static テスト `__tests__/static/tc-2040-ta-phases-comment-history.test.ts` が、request-hung 再発の歴史的背景と `Promise.all` 非採用の意図を検証していることを確認する
  3. テストに含まれる `route.ts` の該当ブロックが、`retryDbRead` ベースの sequential 実装を維持していることを確認する
- **期待結果**: D1 の sequential 読み取り方針と背景要件が static テストで安定的に監視される
- **スクリプト**: `__tests__/static/tc-2040-ta-phases-comment-history.test.ts`

### TC-2045: TA phases の sequential D1 読み込みガードがコメント終端文言に依存しない
- **URL**: `/api/tournaments/[id]/ta/phases?phase=phase1`
- **authRequired**: false (static/unit coverage)
- **背景**: issue #2045。TC-2040 の static guard が `End of the D1 read section` という説明コメントをブロック終端マーカーにすると、コメント整理だけで guard が壊れる。sequential D1 read の検証は、説明文ではなくコメントブロック末尾と次の実処理ステートメントを境界にする。
- **手順**:
  1. `tc-2040-ta-phases-comment-history.test.ts` が `sectionAfterBlockComment` を使うことを確認する
  2. 同 guard が `End of the D1 read section` を検索境界として使っていないことを確認する
  3. helper の単体テストが、コメント末尾から次の `const normalizedRounds =` 境界までを抽出できることを確認する
  4. helper の単体テストが、境界欠落時に明示的なエラーを出すことを確認する
- **期待結果**: コメント終端文言を変更しても sequential read block の `retryDbRead` / `Promise.all` ガードは維持される
- **スクリプト**: `__tests__/docs/e2e-cases-drift.test.ts` / `__tests__/static/tc-2040-ta-phases-comment-history.test.ts` / `__tests__/helpers/e2e-cases.test.ts`

### TC-2049: sectionAfterBlockComment helper の重複マーカー契約を明示する
- **URL**: static/unit coverage
- **authRequired**: false
- **背景**: issue #2049。`sectionAfterBlockComment` は `commentStartMarker` の最初の出現から抽出する。対象ソース内に同じ文言が複数ある場合でもこの契約がコメントとテストで明示されていないと、後続の static guard が誤ったブロックを読む可能性がある。
- **手順**:
  1. `sectionAfterBlockComment` の JSDoc が first block comment contract を説明していることを確認する
  2. helper の単体テストが、同じ `commentStartMarker` を含むブロックコメントが複数ある場合に最初のブロック後だけを抽出することを確認する
  3. drift test が TC-2049 の台帳、helper JSDoc、helper 単体テストをひも付けることを確認する
- **期待結果**: 重複マーカーがあっても helper の first-match 挙動が明文化され、意図せず後続ブロックを読む変更を検知できる
- **スクリプト**: `__tests__/docs/e2e-cases-drift.test.ts` / `__tests__/helpers/e2e-cases.test.ts`

### TC-2055: sectionBetween helper の allowTerminal 終端セクション契約を明示する
- **URL**: static/unit coverage
- **authRequired**: false
- **背景**: issue #2055。`sectionBetween` は `allowTerminal: true` のとき、end marker がない終端セクションを許可する。終端セクションに本文がある場合は末尾まで返し、本文がない場合は `terminal section for marker ... has no content` を投げる契約をテストで固定する。
- **手順**:
  1. helper の単体テストが `allowTerminal: true` かつ end marker 欠落時に start marker から末尾まで返すことを確認する
  2. helper の単体テストが `allowTerminal: true` かつ start marker 直後に本文がない場合に明示的なエラーを返すことを確認する
  3. drift test が TC-2055 の台帳と helper 単体テストをひも付けることを確認する
- **期待結果**: 終端セクションを許可する static guard が、end marker 欠落時の正常系と空本文エラー系の両方で回帰検知される
- **スクリプト**: `__tests__/docs/e2e-cases-drift.test.ts` / `__tests__/helpers/e2e-cases.test.ts`

### TC-2058: sectionBetween helper の allowTerminal 空白のみ終端を拒否する
- **URL**: static/unit coverage
- **authRequired**: false
- **背景**: issue #2058。`allowTerminal: true` の終端セクションで start marker の後ろが改行やスペースのみの場合、本文ありとして扱うと drift guard が空白だけの範囲を有効な抽出結果として受け入れてしまう。
- **手順**:
  1. helper の単体テストが `allowTerminal: true` かつ start marker 後ろが空白のみの終端セクションを用意する
  2. `sectionBetween` が空白のみの終端セクションを `terminal section for marker ... has no content` として拒否することを確認する
  3. drift test が TC-2058 の台帳と helper 単体テストをひも付けることを確認する
- **期待結果**: 終端セクションを許可する static guard は、実質的な本文がない空白のみの抽出範囲を有効なコンテンツとして扱わない
- **スクリプト**: `__tests__/docs/e2e-cases-drift.test.ts` / `__tests__/helpers/e2e-cases.test.ts`

### TC-2063: sectionBetween helper の混在ホワイトスペース終端を拒否する
- **URL**: static/unit coverage
- **authRequired**: false
- **背景**: issue #2063。`allowTerminal: true` の終端セクションで start marker 後ろがスペースとタブの混在だけの場合も、本文ありとして扱うと drift guard が実質空の抽出範囲を受け入れてしまう。
- **手順**:
  1. helper の単体テストが `allowTerminal: true` かつ start marker 後ろがスペース+タブ混在のみの終端セクションを用意する
  2. `sectionBetween` が混在ホワイトスペースのみの終端セクションを `terminal section for marker ... has no content` として拒否することを確認する
  3. drift test が TC-2063 の台帳と helper 単体テストをひも付けることを確認する
- **期待結果**: 終端セクションを許可する static guard は、スペースとタブが混在していても実質的な本文がない抽出範囲を有効なコンテンツとして扱わない
- **スクリプト**: `__tests__/docs/e2e-cases-drift.test.ts` / `__tests__/helpers/e2e-cases.test.ts`

### TC-915: overlay `?initial=1` — ダッシュボード初期バックフィル
- **URL**: GET /api/tournaments/:id/overlay-events?initial=1
- **authRequired**: false
- **背景**: OBS ダッシュボードの初回ロード時は 7 日分の過去イベントを最大 100 件取得できる。
  また、フェーズ情報 (`currentPhase`) は常に返される。
- **手順**:
  1. `?initial=1` で GET
  2. レスポンス形式を確認
- **期待結果**:
  - HTTP 200, `success: true`
  - `data.events` が配列（最大 100 件）
  - `data.currentPhase` が文字列
  - `data.serverTime` が ISO 文字列
  - `Cache-Control: no-store`
- **スクリプト**: tc-overlay.js TC-915

### TC-814: TA/TT 決勝フェーズ — Phase1 最下位同着をサドンデスで解決
- **URL**: `/tournaments/[id]/ta/phase1`, `/api/tournaments/[id]/ta/phases`
- **背景**: Phase1/2 の通常ラウンドで最下位が同タイムの場合、即時敗退させず同着者だけのサドンデスに進む必要がある。
- **手順**:
  1. TA 予選17-24位相当の8名を作成し、Phase1へ昇格する
  2. Phase1 ラウンド1を開始し、最下位2名に同じタイムを入力して送信する
  3. API レスポンスとUIにサドンデス要求、対象2名、ランダム決定済みコースが表示されることを確認する
  4. サドンデスコースを管理者が別の利用可能コースへ変更する
  5. サドンデス結果で片方を遅くして送信する
- **期待結果**: 変更後コースだけがサドンデス履歴に残り、遅い選手1名だけが敗退する
- **スクリプト**: tc-ta.js TC-814

### TC-827: TA/TT 決勝フェーズ — サドンデス作成の sequence 競合を復旧する
- **URL**: `/api/tournaments/[id]/ta/phases`
- **背景**: issue #827。`createSuddenDeathRound` は `count` で次の `sequence` を決めてから作成するため、並行リクエストが同じ `phaseRoundId` と `sequence` で作成すると `@@unique([phaseRoundId, sequence])` に衝突する。ユーザーに不明瞭な DB エラーを返さず、同じ元ラウンドに未解決サドンデスを重複作成しないよう、`P2002` を検出して既存の未解決サドンデスを再利用する。
- **手順**:
  1. Phase1 の通常ラウンド送信でサドンデスが必要な同タイム結果を作る
  2. 1回目の `TTPhaseSuddenDeathRound.create` が `P2002` になる状態を単体テストで再現する
  3. 競合相手が作った既存の未解決サドンデスを取得し、新しい sequence を重複作成しないことを確認する
  4. 既存サドンデスの対象者が現在の同着対象と違う場合は、成功扱いにせず refresh を促す明確な競合エラーにする
  5. `P2002` 後に既存サドンデスが見つからない場合は再試行し、上限到達時は明確な作成失敗エラーにする
- **期待結果**: 同じ対象者の unique 競合は既存ラウンド再利用で解消され、`tieBreakRequired` と作成済み `suddenDeathRound` が返る。対象者が違う競合や再利用不能な連続競合は、混在状態の成功レスポンスを返さない
- **スクリプト**: `__tests__/lib/ta/finals-phase-manager.test.ts`

### TC-823A: TA/TT コース選択 — 通常ラウンドでも直前コースを避ける意図を固定する
- **URL**: course-selection guard
- **背景**: issue #823。`selectRandomCourse` は通常ラウンドでも `selectRandomAvailableCourse` を使うため、利用可能コースが2つ以上ある場合は直前コースを候補から外す。この挙動はサドンデス専用ではなく、共有20コースサイクルを維持しつつ back-to-back repeat を避けるための意図的な仕様として文書化する。
- **手順**:
  1. `selectRandomAvailableCourse(["MC1"], "DP1")` を実行する
  2. `DP1` 以外の利用可能コースが返ることを確認する
  3. 現サイクルで残り1コースだけの状態では、直前コースであっても選択可能であることを確認する
  4. `selectRandomCourse` のコメントが通常ラウンドにも同じ直前回避を適用する意図を説明していることを確認する
- **期待結果**: 代替コースがある場合は直前コースを避け、残り1コースしかない場合は20コースサイクル完了を優先して選択する
- **スクリプト**: `__tests__/lib/ta/course-selection.test.ts`

### TC-822A: TA/TT サドンデス UI — 英語ハードコードを i18n 翻訳キーへ移す
- **URL**: `/tournaments/[id]/ta/finals`, `/tournaments/[id]/ta/phase1`, `/tournaments/[id]/ta/phase2`
- **背景**: issue #822。TA サドンデスカードのタイトル、コースラベル、送信ボタン、タイム入力エラーが英語文字列として UI に直書きされていると、日本語表示でも該当箇所だけ英語のまま残る。
- **手順**:
  1. 共有 namespace `taSuddenDeath` に `suddenDeathTiebreak` / `suddenDeathRoundDesc` / `suddenDeathCourse` / `submitSuddenDeath` があることを確認する
  2. Phase3 ページが翻訳キー経由でサドンデス UI 文字列を解決していることを確認する
  3. Phase1/2 コンポーネントが翻訳キー経由でサドンデス UI 文字列と invalid time エラーを解決していることを確認する
  4. UI source に `Submit sudden death` / `Sudden-death tiebreak` / `Sudden-death course` / 直書き invalid-time template が残っていないことを確認する
- **期待結果**: TA サドンデス UI のユーザー向け文字列は `messages/en.json` と `messages/ja.json` の翻訳キー経由で表示される
- **スクリプト**: `__tests__/docs/e2e-cases-drift.test.ts`, `__tests__/i18n/messages.test.ts`

### TC-821A: TA/TT サドンデス UI — Phase3 と Phase1/2 の重複実装を共有化する
- **URL**: `/tournaments/[id]/ta/finals`, `/tournaments/[id]/ta/phase1`, `/tournaments/[id]/ta/phase2`
- **背景**: issue #821。TA サドンデスの pending 判定、対象プレイヤー抽出、コース変更、結果送信、入力カード JSX が Phase3 ページと Phase1/2 コンポーネントに重複していると、片方だけの修正漏れが起きやすい。
- **手順**:
  1. `TASuddenDeathPanel` がサドンデス入力カード JSX を持つことを確認する
  2. `useTaSuddenDeath` が pending 判定、対象プレイヤー抽出、コース変更、結果送信を持つことを確認する
  3. Phase3 ページと Phase1/2 コンポーネントが `TASuddenDeathPanel` と `useTaSuddenDeath` を利用することを確認する
  4. Phase3 ページと Phase1/2 コンポーネントに `change_sudden_death_course` / `submit_sudden_death` の直接実装が残っていないことを確認する
- **期待結果**: TA サドンデス UI と主要ロジックは共有 hook/component で一元管理され、Phase3 と Phase1/2 は差分だけを props として渡す
- **スクリプト**: `__tests__/docs/e2e-cases-drift.test.ts`

### TC-1864A: TA/TT サドンデス共有 hook — fetch 副作用を単体テストで固定する
- **URL**: hook unit test
- **背景**: issue #1864。`useTaSuddenDeath` がコース変更・結果送信の fetch と `setSaveError` / `fetchData` の副作用を持つため、共有化後に Phase3 と Phase1/2 の両方へ同じ regression が波及する。
- **手順**:
  1. `handleSubmitSuddenDeath` の成功時に `submit_sudden_death` payload、入力リセット、`fetchData` 呼び出しを確認する
  2. `handleSubmitSuddenDeath` の API エラー時に `setSaveError` が呼ばれ、`fetchData` が呼ばれないことを確認する
  3. `handleSuddenDeathCourseChange` の成功時に `change_sudden_death_course` payload と `fetchData` 呼び出しを確認する
  4. `handleSuddenDeathCourseChange` の API エラー時に `setSaveError` が呼ばれ、`fetchData` が呼ばれないことを確認する
- **期待結果**: サドンデス共有 hook の非同期 fetch ロジックは成功・失敗の両方で単体テストにより保護される
- **スクリプト**: `__tests__/components/tournament/ta-sudden-death-panel.test.tsx`, `__tests__/docs/e2e-cases-drift.test.ts`

### TC-1865A: TA/TT サドンデス共有 hook — 空 blur を no-op にする
- **URL**: hook unit test
- **背景**: issue #1865。共有化前の Phase3 / Phase1/2 実装は空入力の blur を早期 return していたが、共有 hook でガードが落ちると空入力で `suddenDeathTimes[playerId] = ""` が追加される可能性がある。
- **手順**:
  1. `suddenDeathTimes` が空の状態で `handleSuddenDeathTimeBlur(playerId)` を呼ぶ
  2. `suddenDeathTimes` に空文字の playerId エントリが追加されないことを確認する
  3. `useTaSuddenDeath` の実装に `if (!raw || raw.trim() === "") return;` の空入力ガードがあることを確認する
- **期待結果**: 空入力 blur は共有化前と同じ no-op であり、不要な空文字 state を作らない
- **スクリプト**: `__tests__/components/tournament/ta-sudden-death-panel.test.tsx`, `__tests__/docs/e2e-cases-drift.test.ts`

### TC-1867A: TA/TT サドンデス共有 hook テスト — fetch mock を restore 可能にする
- **URL**: hook unit test
- **背景**: issue #1867。`global.fetch = jest.fn()` の直接代入は `jest.restoreAllMocks()` で復元されず、別テストへ fetch mock が漏れる可能性がある。
- **手順**:
  1. `ta-sudden-death-panel.test.tsx` の fetch mock が `jest.spyOn(global, 'fetch')` を使うことを確認する
  2. 同ファイルに `global.fetch =` の直接代入が残っていないことを確認する
  3. `afterEach` が `jest.restoreAllMocks()` で spy を復元することを確認する
- **期待結果**: fetch mock は各テスト後に復元され、テスト間の副作用を残さない
- **スクリプト**: `__tests__/components/tournament/ta-sudden-death-panel.test.tsx`, `__tests__/docs/e2e-cases-drift.test.ts`

### TC-1868A: TA/TT サドンデス共有 hook — 有効時刻 blur の自動フォーマットを検証する
- **URL**: hook unit test
- **背景**: issue #1868。空入力 blur の no-op だけでは、有効な短縮入力が `autoFormatTime` によって表示形式へ正規化される共有 hook の既存 UX を保証できない。
- **手順**:
  1. digits-only 入力は右詰め `MSScc` として扱うため、`setSuddenDeathTime(playerId, "10000")` で短縮入力をセットする
  2. `handleSuddenDeathTimeBlur(playerId)` を呼ぶ
  3. `suddenDeathTimes[playerId]` が `1:00.00` に更新されることを確認する
- **期待結果**: 有効な時刻入力の blur は共有化後も自動フォーマットされる
- **スクリプト**: `__tests__/components/tournament/ta-sudden-death-panel.test.tsx`, `__tests__/docs/e2e-cases-drift.test.ts`

### TC-824: TA/TT Phase3 — サドンデス順位をタイム加算ではなく明示順序で処理する
- **URL**: `/api/tournaments/[id]/ta/phases`
- **背景**: issue #824。Phase3 サドンデス解決後に `timeMs + 1ms` のような rank offset で順位を表すと、非サドンデス選手の実タイムと同値になり、life-loss 境界や reset threshold の elimination cap で別の選手が落ちる可能性がある。
- **手順**:
  1. Phase3 の5名が全員残り1 life の状態を作る
  2. サドンデス解決後の明示順序では `p5` が最も遅いが、`p3` と `p5` の `timeMs` が同値になる結果を投入する
  3. reset threshold 4 に向かうため elimination cap が1名に制限される状態で `processPhase3Result` を実行する
  4. Phase3 サドンデス後の処理が `timeMs` の同値ではなく明示順序 map を使うことを確認する
- **期待結果**: `p3` ではなく明示順序で最も遅い `p5` だけが eliminated になり、非サドンデス選手との 1ms 衝突で境界判定が変わらない
- **スクリプト**: `__tests__/lib/ta/finals-phase-manager.test.ts`

### TC-825: TA/TT 決勝フェーズ — Prisma migration の JSON 列型を SQLite/D1 と揃える
- **URL**: migration/schema guard
- **背景**: issue #825/#1838。Prisma 側の `Json` カラム migration が SQLite/D1 非互換の `JSONB` を使うと、Wrangler migration や preview/prod D1 の実体と型定義がズレる。個別ファイルだけの確認では将来の Prisma 生成 migration で同じ不整合を再発させるため、全 Prisma migration を横断して検査する。
- **手順**:
  1. Prisma migration `prisma/migrations/0010_ta_phase_sudden_death/migration.sql` を読む
  2. `targetPlayerIds` と `results` が `TEXT` で定義されていることを確認する
  3. 同じ SQLite/D1 互換性が必要な GP finals の `cupResults` / `assignedCups` migration も `TEXT` で定義されていることを確認する
  4. `prisma/migrations/**/migration.sql` を再帰的に走査し、初期 migration を含む全 Prisma migration に `JSONB` が残っていないことを確認する
- **期待結果**: すべての Prisma migration の JSON 格納列は SQLite/D1 互換の `TEXT` として記録され、新規 migration が非互換型を再導入した場合は `__tests__/docs/prisma-migrations.test.ts` が失敗する
- **スクリプト**: `__tests__/docs/prisma-migrations.test.ts`

### TC-1033: TA/TT 決勝フェーズ — サドンデス判定の内部理由をAPI payloadに出さない
- **URL**: `/tournaments/[id]/ta/phase1`, `/api/tournaments/[id]/ta/phases`
- **背景**: issue #1033/#1637/#1638。`TieBreakDecision.reason` は呼び出し元・DB・APIで未使用の内部診断候補で、公開payloadに出す必要がない。YAGNIに従い、サドンデス開始時に必要な `targetPlayerIds` だけを扱う。テストデータは API の `entries` 返却順に依存せず、`playerId` の決定的順序に並べてから同着対象を選ぶ。
- **手順**:
  1. 24名 TA 予選を作成し、Phase1 に17-24位の8名を昇格する
  2. Phase1 ラウンド1で、`playerId` 順に並べた最後の2名を同タイムにしてサドンデスを発生させる
  3. `submit_results` のレスポンスに含まれる `suddenDeathRound` を確認する
- **期待結果**: `suddenDeathRound.targetPlayerIds` は2名分返り、未使用の `reason` フィールドは返らない
- **スクリプト**: tc-ta.js TC-1033

### TC-1032: TA/TT 決勝フェーズ — Phase3 リセット閾値越えのゼロライフ候補は全員サドンデス対象
- **URL**: `/tournaments/[id]/ta/finals`, `/api/tournaments/[id]/ta/phases`
- **背景**: issue #1032。Phase3 では 9→8 などのリセット閾値で、ゼロライフ候補が許容脱落数を超える場合、遅い一部だけを順序付けすると active field がリセットサイズを下回る危険がある。そのため候補全員をサドンデス対象にする理由をコードコメントとして維持する。
- **手順**:
  1. Phase3 に9名を用意し、遅い側3名の lives を1に調整する
  2. Phase3 通常ラウンドを開始する
  3. 遅い側3名が全員ゼロライフ候補になる結果を送信する
  4. `submit_results` のレスポンスに含まれる `suddenDeathRound.targetPlayerIds` を確認する
- **期待結果**: 9→8 のリセット閾値をまたぐため、ゼロライフ候補3名すべてがサドンデス対象になり、通常の一部脱落処理はまだ実行されない
- **スクリプト**: tc-ta.js TC-1032

### TC-815: TA/TT 決勝フェーズ — Phase3 境界同着をサドンデスで解決
- **URL**: `/tournaments/[id]/ta/finals`, `/api/tournaments/[id]/ta/phases`
- **背景**: Phase3 ではライフ減少対象と安全圏の境界に同タイムがまたがる場合、下半分を確定できないためサドンデスが必要。
- **手順**:
  1. Phase3 に4名以上を用意し、通常ラウンドを開始する
  2. 2位/3位境界の2名を同タイムにして送信する
  3. サドンデス対象が境界同着の2名だけであることを確認する
  4. 1回目サドンデスでも同タイムを入力して再サドンデスへ進むことを確認する
  5. 2回目サドンデスで差をつけて送信する
- **期待結果**: サドンデスで遅い選手がライフ減少対象に入り、境界外の同タイムは要求されない
- **スクリプト**: tc-ta.js TC-815

### TC-816: TA 決勝フェーズ開始済みページの初期表示で開始ボタンがちらつかない
- **URL**: `/tournaments/[id]/ta`, `/api/tournaments/[id]/ta/phases`
- **背景**: issue #1161。TA ページを開いた直後、フェーズ状態取得が完了するまで既に Phase 1 が開始済みでも一瞬 `Start Phase 1` / `フェーズ1開始` が表示されることがあった。
- **手順**:
  1. 共有 TA 予選 fixture を Phase 1 開始済みにする
  2. `/api/tournaments/[id]/ta/phases` の GET 応答を遅延させた状態で `/tournaments/[id]/ta` を開く
  3. フェーズ状態取得中に Phase 1 開始ボタンが表示されないことを確認する
  4. フェーズ状態取得後に Phase 1 への遷移ボタンが表示されることを確認する
- **期待結果**: phase status がロード中の間は promotion CTA を描画せず、ロード完了後は開始済みフェーズへの遷移導線だけが表示される
- **スクリプト**: tc-ta.js TC-816

### TC-817: TA 決勝フェーズ — Phase1 サドンデスコースは Phase2 の通常ラウンド候補に戻らない
- **URL**: `/tournaments/[id]/ta/phase1`, `/tournaments/[id]/ta/phase2`, `/api/tournaments/[id]/ta/phases`
- **背景**: issue #1038。現行仕様ではサドンデスで使ったコースも通常ラウンドと同じ20本サイクルを消費するため、Phase1 サドンデスで KB1 を使った後は Phase2 開始時点の `availableCourses` に KB1 が戻ってはいけない。
- **手順**:
  1. 24名 TA 予選を作成し、Phase1 に17-24位の8名を昇格する
  2. Phase1 ラウンド1を MC1 で開始し、最下位2名を同タイムにしてサドンデスを発生させる
  3. サドンデスコースを KB1 に変更し、片方を遅くして解決する
  4. Phase1 の残り3ラウンドを DP1/GV1/BC1 で消化して4名まで絞り、Phase2 に昇格する
  5. Phase2 の `playedCourses` / `availableCourses` を取得し、KB1 で通常ラウンド開始を試す
- **期待結果**: `playedCourses` に KB1 が含まれ、`availableCourses` は15件で KB1 を含まず、Phase2 通常ラウンドを KB1 で開始しようとすると400になる
- **スクリプト**: tc-ta.js TC-817

### TC-1528: TA 決勝フェーズ — API ラウンド送信ヘルパーの公開面を最小化する
- **URL**: `/api/tournaments/[id]/ta/phases`
- **背景**: issue #1528/#1530/#1531。`tc-ta.js` の自動コース選択経路とコース明示経路はどちらも `start_round` 後に同じ `roundNumber` で `submit_results` するため、片方だけ変更されると TA 決勝 E2E のセットアップ挙動が分岐しやすい。一方でテスト用公開面は2つの公開 helper に限定し、直接テストしない内部 helper や単純な label helper は外へ出さない。
- **手順**:
  1. 自動コース選択の phase round 送信で、`start_round` が `course` なしで呼ばれることを確認する
  2. コース明示の phase round 送信で、`start_round` に指定コースが含まれることを確認する
  3. どちらの経路も `start_round` の `roundNumber` を `submit_results` に渡すことを確認する
  4. 自動コース選択経路の既存戻り値と、コース明示経路の既存戻り値が変わらないことを確認する
  5. `__testHooks` が `submitTaPhaseRoundByApi` / `submitTaPhaseRoundWithCourseByApi` の2つだけを公開し、内部 `submitTaPhaseRound` は公開しないことを確認する
- **期待結果**: 2つの公開 helper は同じ内部 start/submit 実装を使い、API payload と戻り値互換性が維持される。内部 helper は `__testHooks` に露出せず、phase/course label は送信 helper 内で必要時にだけ組み立てられる
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/e2e/ta-phase-submit-helper.test.ts

### TC-1063: BM/MR/GP 合算順位タブの ranking 計算を render IIFE から分離する
- **背景**: issue #1063 および follow-up issue #1555/#1556。BM/MR/GP の合算順位タブで `combinedRankings` を JSX 内 IIFE で毎 render 計算すると、表示 JSX と順位計算が混ざり、将来の列変更時に再計算条件を見落としやすい。
- **手順**:
  1. BM/MR/GP の page-client.tsx を静的検査する
  2. `combinedRankings` が `useMemo` で `qualifications` 依存として定義されていることを確認する
  3. 合算順位タブの JSX 内で `computeCombinedRanks` を直接呼ばないことを確認する
- **期待結果**: 合算順位タブは memoized `combinedRankings` を描画だけに使い、BM/MR は score→points、GP は `compareGpQualificationEntries` の既存タイブレークを維持する
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/static/tc-1063-combined-rankings-usememo.test.ts

### TC-1555: BM/MR 合算順位 comparator を共通関数で共有する
- **背景**: issue #1555。BM/MR の score→points comparator が別々の関数として重複すると、片方だけ変更されるリスクがある。
- **手順**:
  1. `ranking-utils.ts` に score→points comparator が1つだけ公開されていることを確認する
  2. BM/MR page-client がその共通 comparator を `computeCombinedRanks` に渡していることを確認する
  3. comparator の単体テストで score 優先、同 score では points 優先の順序を確認する
- **期待結果**: BM/MR の合算順位は同じ共通 comparator を使い、順位ルールが片方だけ drift しない
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/lib/ranking-utils.test.ts / smkc-score-app/__tests__/static/tc-1063-combined-rankings-usememo.test.ts

### TC-1556: TC-1063 静的テストをコメント文字列と import 順に依存させない
- **背景**: issue #1556。`tc-1063-combined-rankings-usememo.test.ts` がコメント文や `useMemo` import 順へ強く依存すると、挙動と無関係な整形・コメント修正で壊れやすい。
- **手順**:
  1. `combinedRankings` 宣言の検査終端がコメント文ではなく次の変数宣言になっていることを確認する
  2. React import の `useMemo` 検査が import 順に依存しない正規表現になっていることを確認する
  3. 合算順位タブ JSX では `combinedRankings` を表示コンポーネントに渡し、`computeCombinedRanks(` を直接呼ばないことを確認する
- **期待結果**: 静的テストは実装の重要な契約だけを固定し、コメント文・import 並び替えや表示コンポーネント抽出では失敗しない
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/static/tc-1063-combined-rankings-usememo.test.ts

### TC-1558: score→points comparator の不要な generic を持たせない
- **背景**: issue #1558。`compareByScoreThenPoints` は戻り値に型引数を反映しないため、generic にすると実装意図より複雑に見える。
- **手順**:
  1. `ranking-utils.ts` の `compareByScoreThenPoints` シグネチャを確認する
  2. 引数型が `ScorePointsEntry` で、不要な `<T extends ScorePointsEntry>` を持たないことを確認する
  3. 既存の comparator 単体テストで score→points 順序が変わっていないことを確認する
- **期待結果**: comparator は構造的型付けで BM/MR の qualification entry に使え、余分な generic なしで同じ順位順を返す
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/lib/ranking-utils.test.ts / smkc-score-app/__tests__/static/tc-1063-combined-rankings-usememo.test.ts

### TC-1064: BM/MR 合算順位テーブルを共通コンポーネントで描画する
- **背景**: issue #1064。BM と MR の合算順位タブは同じ列・同じ表示ロジックを持つため、page-client.tsx に重複 JSX を残すと片方だけ列や書式が drift する。
- **手順**:
  1. BM/MR page-client が `CombinedStandingsTable` を参照していることを静的検査する
  2. BM/MR page-client の合算順位タブ内に重複した `<TableHeader>` / `combinedRankings.map` が残っていないことを確認する
  3. `CombinedStandingsTable` の単体テストで rank/group/player/score/qualification points が描画されることを確認する
- **期待結果**: BM/MR の合算順位タブは同じ共通コンポーネントで描画され、順位計算済み `combinedRankings` と qualification-points formatter だけを渡す
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/components/tournament/combined-standings-table.test.tsx / smkc-score-app/__tests__/static/tc-1064-combined-standings-table.test.ts

### TC-1579: 合算順位テーブルの予選点 tooltip label を必須にする
- **背景**: issue #1579。`CombinedStandingsTableLabels.qualificationPointsTooltip` が optional のままだと、新しい BM/MR 合算順位ページを追加したときに tooltip を渡し忘れても型チェックで検出されない。
- **手順**:
  1. `CombinedStandingsTableLabels` の `qualificationPointsTooltip` が必須フィールドであることを静的検査する
  2. BM/MR page-client が `qualificationPointsTooltip: tc('qualificationPointsTooltip')` を渡していることを確認する
  3. `CombinedStandingsTable` の単体テストで label fixture が `CombinedStandingsTableLabels` を満たし、予選点ヘッダーの `title` が描画されることを確認する
- **期待結果**: 合算順位テーブルの利用側は tooltip label の渡し忘れを型・静的テストで検出でき、予選点ヘッダーには 0-1000 正規化の説明 title が必ず設定される
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/components/tournament/combined-standings-table.test.tsx / smkc-score-app/__tests__/static/tc-1579-combined-standings-tooltip-contract.test.ts

### TC-1024: BM/MR/GP 予選点表示を共有 helper に集約する
- **背景**: issue #1019/#1024/#1025。BM/MR/GP page-client が同じ `normalizePoints(score, calculateMaxMatchPoints(mp))` 式を個別に持つと、未完了試合や表示列の修正時に片方だけ drift する。さらに `calculateQualificationPointsFromMatches` の未完了試合向け正規化が unit test で固定されていなかった。
- **手順**:
  1. `qualification-points.ts` が表示用 `getQualificationPoints(mp, score)` helper を export していることを確認する
  2. BM/MR/GP page-client が `calculateMaxMatchPoints` / `normalizePoints` を直接 import せず、共有 helper を使って予選点列を表示することを確認する
  3. `calculateQualificationPointsFromMatches` の単体テストで、全試合完了、試合数差、`matchesPlayed=0` のゼロ除算ガードを確認する
- **期待結果**: 予選点表示の 0-1000 正規化式は1箇所に集約され、未完了試合の正規化挙動も単体テストで固定される
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/lib/points/qualification-points.test.ts / smkc-score-app/__tests__/static/tc-1024-qualification-points-helper.test.ts

### TC-1652: getQualificationPoints の JSDoc を WHY だけに絞る
- **背景**: issue #1652。`getQualificationPoints` は薄い表示用 wrapper なので、引数名と型から自明な `@param` / `@returns` を残すと、コメント量に対して得られる情報が少ない。一方で、BM/MR/GP の drift 防止という理由はコードだけでは読み取りにくいため残す。
- **手順**:
  1. `getQualificationPoints` の JSDoc が BM/MR/GP page-client の drift 防止理由を説明していることを確認する
  2. 同じ JSDoc に `@param` と `@returns` が含まれないことを確認する
  3. TC-1024 の共有 helper static guard と単体テストが引き続き通ることを確認する
- **期待結果**: コメントは実装理由だけを補足し、関数シグネチャと重複する説明を持たない
- **スクリプト**: n/a (static coverage) — smkc-score-app/__tests__/static/tc-1024-qualification-points-helper.test.ts

### TC-1654: getQualificationPoints JSDoc guard が関数直前だけを許可する
- **背景**: issue #1654/#1655。`precedingJsdocForFunction` が最後の JSDoc を拾うだけだと、JSDoc と関数定義の間に別コードが挟まっても誤検知する。また、WHY 概念を検査する正規表現の `centraliz` 語幹マッチは意図が読みにくい。
- **手順**:
  1. `precedingJsdocForFunction` が JSDoc 終端と `export function getQualificationPoints` の間に空白以外を許可しないことを確認する
  2. fixture で JSDoc と関数定義の間に `const unrelated = true;` を挟むと helper が失敗することを確認する
  3. WHY 概念の正規表現が `centraliz(e|ed|ation)` の語幹マッチであることをコメントで明示していることを確認する
- **期待結果**: static guard は対象関数に隣接する JSDoc だけを検査し、正規表現の意図も読み手に明確である
- **スクリプト**: n/a (static coverage) — smkc-score-app/__tests__/static/tc-1024-qualification-points-helper.test.ts

### TC-1657: centraliz 語幹コメント guard を自己参照で常時 pass させない
- **背景**: issue #1657。`tc-1024-qualification-points-helper.test.ts` が自分自身を読み、アサーション内の完全一致文字列で `centraliz(e|ed|ation)` を探すと、実際のコメントを削除してもテストが pass してしまう。
- **手順**:
  1. static test が検索語を分割して作り、アサーション文字列自身が一致対象にならないことを確認する
  2. `// Stem match:` のコメント行に `centraliz(e|ed|ation)` が存在することを確認する
  3. コメントを含む行以外で同じ完全一致文字列を検査していないことを確認する
- **期待結果**: 語幹マッチの説明コメントを削除した場合に static guard が実際に失敗する
- **スクリプト**: n/a (static coverage) — smkc-score-app/__tests__/static/tc-1024-qualification-points-helper.test.ts

### TC-1659: centraliz 検索語分割の自己参照防止理由を明示する
- **背景**: issue #1659。`'centraliz' + '(e|ed|ation)'` の分割は、自分自身を読む static test でアサーション文字列が検索対象に一致しないようにするための意図的な工夫だが、理由がコメントなしでは分かりにくい。
- **手順**:
  1. `stemCommentNeedle` 宣言の直前に自己参照防止の WHY コメントがあることを確認する
  2. static test が `TC-1659` のシナリオを参照していることを確認する
  3. 既存の TC-1657 guard が引き続きコメント行だけを検出することを確認する
- **期待結果**: 検索語分割の理由がコード上で明確になり、将来の単純化で自己参照バグが戻りにくい
- **スクリプト**: n/a (static coverage) — smkc-score-app/__tests__/static/tc-1024-qualification-points-helper.test.ts

### TC-1578: 予選点 tooltip の文言重複を i18n 参照に集約する
- **背景**: issue #1578。予選点 tooltip の文言が `messages/*.json`、`e2e/lib/common.js`、`e2e-cases-drift.test.ts` に重複すると、文言変更時に E2E helper と drift test の同期漏れが起きる。
- **手順**:
  1. `e2e/lib/common.js` が `messages/ja.json` と `messages/en.json` の `common.qualificationPointsShort` / `common.qualificationPointsTooltip` を参照していることを確認する
  2. `assertQualificationPointsColumn` がハードコードした tooltip 完全一致ではなく、i18n 由来の title 一覧で検証していることを確認する
  3. drift/static test が tooltip 本文を再ハードコードせず、i18n 参照 helper の存在を検証していることを確認する
  4. E2E helper の単体テストで、header label と tooltip title が `messages/ja.json` / `messages/en.json` と一致することを確認する
- **期待結果**: 予選点 tooltip の表示文言は i18n JSON が単一の正とされ、E2E helper と drift test は同じ参照元を使う
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/e2e/qualification-points-labels.test.ts / smkc-score-app/__tests__/static/tc-1578-qualification-points-tooltip-source.test.ts

### TC-1584: 予選点 i18n キー欠損を無音スキップしない
- **背景**: issue #1584。`filter(Boolean)` で `qualificationPointsShort` / `qualificationPointsTooltip` の欠損を落とすと、片方の locale だけが残った状態でも E2E helper が初期化できてしまう。
- **手順**:
  1. `e2e/lib/common.js` の予選点 label 初期化に `filter(Boolean)` が残っていないことを静的検査する
  2. locale ごとに必須 message key を検証し、欠損時は `messages/<locale>.json common.<key> is required` で失敗することを確認する
  3. E2E helper の単体テストで、header label と tooltip title が ja/en の2件ずつ揃っていることを確認する
- **期待結果**: i18n JSON から必要なキーが消えた場合、配列を縮小して pass せず、helper 初期化時に原因が分かるエラーで失敗する
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/e2e/qualification-points-labels.test.ts / smkc-score-app/__tests__/static/tc-1578-qualification-points-tooltip-source.test.ts

### TC-1585: 予選点 i18n 参照を直接 locale 配列で保持する
- **背景**: issue #1585。`COMMON_MESSAGES_BY_LOCALE` オブジェクトを `Object.values()` で配列化するだけなら、locale 情報つき配列を直接持つ方がシンプルで、欠損エラーにも locale 名を出しやすい。
- **手順**:
  1. `e2e/lib/common.js` が `LOCALE_COMMON_MESSAGES` 配列で ja/en の common messages を保持していることを静的検査する
  2. `Object.values(COMMON_MESSAGES_BY_LOCALE)` に依存した初期化が残っていないことを確認する
  3. `getQualificationPointsHeaderLabels()` / `getQualificationPointsTooltipTitles()` の戻り値が i18n JSON の順序・値と一致することを単体テストで確認する
- **期待結果**: 予選点 label の参照元は locale 情報を持つ配列に統一され、冗長な中間オブジェクトなしで i18n JSON から値を取得する
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/e2e/qualification-points-labels.test.ts / smkc-score-app/__tests__/static/tc-1578-qualification-points-tooltip-source.test.ts

### TC-1587: 予選点 i18n キー欠損時の throw パスを単体テストする
- **背景**: issue #1587。`getRequiredCommonMessage` の目的はキー欠損を fail-loud にすることなので、happy path だけではなく、JSON mock でキーを欠落させた require 時の throw を検証する必要がある。
- **手順**:
  1. `jest.isolateModules` と JSON mock を使い、`messages/ja.json` から `qualificationPointsShort` を欠落させる
  2. `e2e/lib/common.js` の require が `messages/ja.json common.qualificationPointsShort is required` で throw することを確認する
  3. 通常の header label / tooltip title の happy path が引き続き通ることを確認する
- **期待結果**: 必須 i18n キーが欠落した場合の fail-loud 挙動が単体テストで固定される
- **スクリプト**: n/a (unit coverage) — smkc-score-app/__tests__/e2e/qualification-points-labels.test.ts

### TC-1588: 予選点 label 静的テストを無関係な require 行に依存させない
- **背景**: issue #1588。`tc-1578-qualification-points-tooltip-source.test.ts` が `const { chromium } = require('playwright');` を section end marker に使うと、E2E helper の require 並び替えだけで壊れる。
- **手順**:
  1. 静的テストが `chromium` require 行を `sectionBetween` の終端として使っていないことを確認する
  2. 予選点 label 初期化のガードは、`QUALIFICATION_POINTS_HEADER_LABELS` / `QUALIFICATION_POINTS_TOOLTIP_TITLES` 周辺の正規表現で直接検査する
  3. `filter(Boolean)` と `Object.values(COMMON_MESSAGES_BY_LOCALE)` が予選点 label 初期化へ戻っていないことを確認する
- **期待結果**: static guard は予選点 label 初期化そのものにだけ依存し、無関係な module require の並び替えで失敗しない
- **スクリプト**: n/a (static coverage) — smkc-score-app/__tests__/static/tc-1578-qualification-points-tooltip-source.test.ts

### TC-1590: isolateModules の外側に不要な dontMock を残さない
- **背景**: issue #1590。`jest.isolateModules` 内で使った JSON mock は隔離レジストリに閉じるため、外側の `jest.dontMock` は不要で読み手を迷わせる。
- **手順**:
  1. `qualification-points-labels.test.ts` の throw パステストを確認する
  2. `jest.isolateModules` ブロック外に `jest.dontMock('../../messages/ja.json')` / `jest.dontMock('../../messages/en.json')` が残っていないことを確認する
  3. i18n キー欠損時の throw パステストが引き続き通ることを確認する
- **期待結果**: throw パステストは隔離 mock だけで完結し、不要な mock 後始末を持たない
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/e2e/qualification-points-labels.test.ts / smkc-score-app/__tests__/static/tc-1578-qualification-points-tooltip-source.test.ts

### TC-1591: sectionBetween 非使用ガードはテストファイル自身を検査する
- **背景**: issue #1591。`sectionBetween` 非使用ガードが `common.js` を読んでいると、テストファイルへ `sectionBetween` が戻っても検出できない。
- **手順**:
  1. `tc-1578-qualification-points-tooltip-source.test.ts` が自分自身のファイル内容を `readRepoFile` で読み込んでいることを確認する
  2. そのテストファイルに `sectionBetween` と `const { chromium } = require('playwright');` 文字列が含まれないことを検査する
  3. 予選点 label 初期化の regex guard は `common.js` に対して維持されていることを確認する
- **期待結果**: static guard はテストファイルへの脆い `sectionBetween` 再導入を実際に検出できる
- **スクリプト**: n/a (static coverage) — smkc-score-app/__tests__/static/tc-1578-qualification-points-tooltip-source.test.ts

### TC-1561: 合算順位テーブルのゼロ点・空配列表示を固定する
- **背景**: issue #1561。`CombinedStandingsTable` の points 表示は正数だけ `+` を付け、ゼロ点は符号なし `0` として表示する必要がある。また、rankings が空のときにダミー行を描画しないことを固定しておくと、共通テーブルの列変更時に BM/MR 合算順位の空状態が drift しない。
- **手順**:
  1. `CombinedStandingsTable` の単体テストで `points: 0` の行を描画する
  2. 同じ行に `+0` が存在せず、符号なし `0` が表示されることを確認する
  3. `rankings={[]}` を渡したとき、`tbody tr` が 0 件であることを確認する
- **期待結果**: 合算順位テーブルはゼロ点を `+0` にせず、空の rankings ではデータ行を描画しない
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/components/tournament/combined-standings-table.test.tsx / smkc-score-app/__tests__/static/tc-1561-combined-standings-table-edge-cases.test.ts

### TC-1563: 合算順位テーブルテストを列数マジックナンバーに依存させない
- **背景**: issue #1563。`CombinedStandingsTable` の単体テストが `getAllByText("0").toHaveLength(7)` や `getAllByText("1").toHaveLength(2)` のような同一文字列の出現数に依存すると、列追加・削除時に原因が読み取りにくい失敗になる。
- **手順**:
  1. `CombinedStandingsTable` の単体テストで、行セルを列ヘッダー名に対応付けて取得する
  2. rank/wins/plus-minus/score/qualification-points など、確認したい列を列名ベースで直接検証する
  3. `getAllByText(...).toHaveLength(...)` による同一文字列の個数検証が残っていないことを静的検査する
- **期待結果**: 合算順位テーブルのテストは列数変更に追従しやすく、ゼロ点の `+0` 非表示や各列の値を意図が分かる形で検証する
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/components/tournament/combined-standings-table.test.tsx / smkc-score-app/__tests__/static/tc-1563-combined-standings-test-selectors.test.ts

### TC-1565: cellsByHeader の列数不一致を明示的に失敗させる
- **背景**: issue #1565。`cellsByHeader` がヘッダー数とセル数を比較しないまま `Object.fromEntries` すると、列数がズレたときに後続の `toHaveTextContent` が `undefined` で失敗し、どこでテーブル構造が壊れたか読み取りにくい。
- **手順**:
  1. `cellsByHeader` で列ヘッダー一覧と行セル一覧を取得する
  2. mapping を作る前に `expect(cells).toHaveLength(headers.length)` を実行する
  3. 静的ガードでこの明示的な列数 assertion が残っていることを確認する
- **期待結果**: 合算順位テーブルの列数がズレた場合、セル値 assertion ではなく列数不一致として読みやすく失敗する
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/components/tournament/combined-standings-table.test.tsx / smkc-score-app/__tests__/static/tc-1563-combined-standings-test-selectors.test.ts

### TC-1566: 合算順位テーブルの重複テキスト個数ガードを汎用化する
- **背景**: issue #1566。TC-1563 の静的ガードが `"0"` と `"1"` だけを禁止すると、将来 `getAllByText("2").toHaveLength(...)` や `getAllByText("Group A").toHaveLength(...)` が混入しても検出できない。
- **手順**:
  1. `combined-standings-table.test.tsx` のテストソースを静的検査する
  2. `getAllByText(...)` の戻り値に対する `toHaveLength(...)` assertion を正規表現で検出する
  3. 値の種類に関係なく、重複テキスト個数に依存する assertion が残っていないことを確認する
- **期待結果**: 合算順位テーブルのテストは特定の文字列だけでなく、すべての `getAllByText(...).toHaveLength(...)` 型アンチパターンを拒否する
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/static/tc-1563-combined-standings-test-selectors.test.ts

### TC-1568: 合算順位テーブル静的ガードの regex がネスト括弧を見逃さない
- **背景**: issue #1568。TC-1566 の静的ガードが `getAllByText\([^)]+\)\)\.toHaveLength` のような `)` を含まない引数だけを想定すると、`new RegExp(...)` や関数呼び出しを含む引数で同じアンチパターンが混入したときに検出できない。
- **手順**:
  1. `combined-standings-table.test.tsx` のテストソースを静的検査する
  2. `getAllByText(` から `)).toHaveLength` までを `[\s\S]*?` で検出する
  3. 括弧を含む引数でも、重複テキスト個数に依存する assertion が拒否されることを静的ガードで確認する
- **期待結果**: 合算順位テーブルの静的ガードは単純な文字列引数だけでなく、ネスト括弧を含む `getAllByText(...).toHaveLength(...)` 型アンチパターンも見逃さない
- **スクリプト**: n/a (unit/static coverage) — smkc-score-app/__tests__/static/tc-1563-combined-standings-test-selectors.test.ts

---

## E2Eテスト実行ガイド
