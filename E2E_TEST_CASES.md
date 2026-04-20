# E2E Test Cases - JSMKC (smkc.bluemoon.works)

## Project: JSMKC - Japan SMK Championship
## Target: https://smkc.bluemoon.works/
## Framework: Next.js 16 (App Router) + React 19
## i18n: next-intl (en/ja)

---

## TC-001: トップページの表示と基本要素の確認
- **URL**: /
- **authRequired**: false
- **手順**:
  1. https://smkc.bluemoon.works/ にアクセス
  2. ページタイトルを確認
  3. ナビゲーション要素を確認（Players, Tournaments リンク）
  4. 言語切り替えボタンの存在確認
  5. ログインリンクの存在確認
- **期待結果**: ページが正常に表示され、主要なナビゲーション要素が存在する

## TC-002: Players ページの表示
- **URL**: /players
- **authRequired**: false
- **手順**:
  1. https://smkc.bluemoon.works/players にアクセス
  2. プレイヤー一覧が表示されるか確認
  3. テーブルまたはリスト形式でデータが表示されるか確認
- **期待結果**: プレイヤー一覧が正常に表示される

## TC-003: Tournaments ページの表示
- **URL**: /tournaments
- **authRequired**: false
- **手順**:
  1. https://smkc.bluemoon.works/tournaments にアクセス
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
  1. https://smkc.bluemoon.works/auth/signin にアクセス
  2. Player タブ（ニックネーム + パスワード）が表示されるか
  3. Admin タブ（Discord OAuth）が表示されるか
  4. フォーム要素が正しく存在するか
- **期待結果**: サインインページが正常に表示される

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
  1. https://smkc.bluemoon.works/ にアクセス
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
  4. `/gp/participant` を開き、カップ割当済みの5コースが自動表示されていることを確認する
  5. 各レースの順位を入力して送信する（コース選択は不要 — 自動入力済み）
  6. participant ページで pending match が消えることと、管理者 API 側で match が `completed` になり合計点が保存されていることを確認する
  7. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: GP の participant 入力フォームでコースが自動入力され、順位のみ入力でスコア送信・永続化される

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
- **背景**: issue #454 / PR #477 で `topN: 24` の BM 決勝生成が二段階化された。予選13〜24位の12名でバラージを行い、勝者4名が Upper Bracket seed 13〜16 に入る
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー **28名** を作成する
  2. BMグループ設定を 4グループ × 7名 (snake-draft) に登録し、全84予選マッチを completed にする
  3. `POST /api/tournaments/[id]/bm/finals` `{ topN: 24 }` を実行し、`phase='playoff'` と 8件の `stage='playoff'` マッチ（`playoff_r1` 4件、`playoff_r2` 4件）が作成されることを確認
  4. バラージ未完了のまま再度 `{ topN: 24 }` を POST → 409 `PLAYOFF_INCOMPLETE` になることを確認
  5. `playoff_r1` M1〜M4 を 5-0 で入力し、各勝者が対応する `playoff_r2` M5〜M8 の `player2` にルーティングされることを確認
  6. `playoff_r2` M5〜M8 を 5-0 で入力し、最後の PUT レスポンスで `playoffComplete=true` になることを確認
  7. 再度 `{ topN: 24 }` を POST し、`phase='finals'` と 31件の `stage='finals'` マッチ（16人ダブルエリミネーション）が作成されることを確認
  8. `seededPlayers` の seed 13〜16 が `playoff_r2` 勝者4名で埋まることを確認
  9. クリーンアップ
- **期待結果**: Top-24 生成はバラージ完了まで Upper Bracket を作らず、完了後に正しい16名決勝ブラケットを生成する

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
  8. クリーンアップ
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

## TC-603: MR引き分け(2-2)スコアの受理確認
- **URL**: /api/tournaments/[temp-id]/mr (PUT)
- **authRequired**: true (admin)
- **背景**: §4.1により2-2引き分けは有効（draw = 1ポイント）。バリデーションが2-2を正しく受理するかを検証
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー2名を作成する
  2. MRグループ設定を行い、pendingマッチを生成する
  3. 管理者APIでscore1=2, score2=2（引き分け）をPUTで送信する
  4. HTTP 200で受理されることを確認する
  5. マッチがcompletedかつscore1=2, score2=2で保存されていることを確認する
  6. 一時トーナメントと一時プレイヤーを削除する
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

## TC-702: GPプレイヤーログインから 5-race 送信
- **URL**: /auth/signin -> /tournaments/[temp-id]/gp/participant
- **authRequired**: true (player)
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー2名を作成（`dualReportEnabled=false`）
  2. GP予選グループ設定で2名のpendingマッチを生成（カップ自動割当付き）
  3. 別の一時ブラウザでP1としてログインし `/api/.../gp/match/:id/report` に
     `{ reportingPlayer: 1, races: [...5 entries with position1=1, position2=5...] }` を POST
  4. レスポンスに `autoConfirmed: true` が含まれること（`dualReportEnabled=false` のため即時確定）
  5. 管理者APIでマッチが completed、`points1=45, points2=0` で保存されていること
  6. クリーンアップ
- **期待結果**: GP participant 入力で5レース順位送信→driver points換算→永続化が動作

## TC-703: GP予選28名フル + 決勝ブラケット生成・1試合スコア入力
- **URL**: /tournaments/[temp-id]/gp/finals
- **authRequired**: true (admin)
- **手順**:
  1. 28名予選 + 全予選マッチ完了（TC-701同様）
  2. `POST /api/.../gp/finals { topN: 8 }` でブラケット生成（17試合）
  3. M1 に `{ score1: 9, score2: 0 }` で API PUT → 200 受理（targetWins=3、9 >= 3 XOR 0 < 3）
  4. 勝者→M5、敗者→M8 にルーティングされること
  5. クリーンアップ
- **期待結果**: 28名予選→上位8名→GP決勝ブラケット生成・スコア入力・進行が正常動作

## TC-704: GP決勝ブラケットリセット（28名予選後）
- **URL**: /tournaments/[temp-id]/gp/finals
- **authRequired**: true (admin)
- **手順**:
  1. TC-703と同様にブラケット生成 → M1 に 9-0 入力
  2. ブラケット生成 API を再 POST（=「Reset Bracket」UI 動作と同等）
  3. 全 17 マッチが pending 状態に戻ること
  4. クリーンアップ
- **期待結果**: ブラケットリセットで全マッチが未完了状態に戻る

## TC-705: GP Grand Final → チャンピオン決定（28名予選後）
- **URL**: /tournaments/[temp-id]/gp/finals
- **authRequired**: true (admin)
- **手順**:
  1. 28名予選 + 決勝ブラケット生成
  2. M1〜M16 を P1 win 9-0 で API 連続入力
  3. M16 (Grand Final) で Winners 側勝者 (P1) が 9-0 で勝つ
  4. `/gp/finals` ページの `body.innerText` にチャンピオンの nickname と "Champion/チャンピオン/優勝" が含まれること
  5. クリーンアップ
- **期待結果**: 全マッチ完了後にチャンピオンが正しく決定・表示される

## TC-706: GP Grand Final Reset Match（28名予選後）
- **URL**: /tournaments/[temp-id]/gp/finals
- **authRequired**: true (admin)
- **背景**: Grand Final で Losers 側が勝った場合、Reset Match (M17) が発生する
- **手順**:
  1. TC-705 同様に M1〜M15 を P1 win 9-0 で消化
  2. M16 で L-side 勝者 (P2) が 0-9 で勝つようにスコア入力
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
  6. クリーンアップ
- **期待結果**: 不一致時はマッチが未完了のまま管理者レビュー待ちになる

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

## TC-822: MR scoresConfirmed後のPUTが400でブロックされることを確認
- **URL**: /api/tournaments/[temp-id]/mr/match/[matchId]/report (POST)
- **authRequired**: true (player)
- **背景**: MRのdual reportにおいて、管理者が不一致を確定（scoresConfirmed）後のPUTはブロックされる
- **手順**:
  1. dualReportEnabled=true のトーナメントでMR matchを作成
  2. P1とP2が異なるスコアを報告し、mismatch状態を作る
  3. 管理者がPUTでscoresConfirmed=trueに確定
  4. 再度スコア報告PUTを送信 → 400で拒否されること
  5. クリーンアップ
- **期待結果**: scoresConfirmed後のスコア報告は400で拒否される

---

## TT (Time Trial / TA) フルワークフローテスト  *(TC-801/804/805/806/807/808 実装済み)*

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

## TC-802: TAプレイヤーログインからタイム入力 ❌ 未実装
- **URL**: /auth/signin -> /tournaments/[temp-id]/ta/participant
- **authRequired**: true (player)
- **背景**: プレイヤーcredentialsログイン → TA participant UI で自分の20コースタイムを入力するシナリオ。tc-ta.js に未実装（tc-ta.js は TC-801/804/805/806/807/808 のみ）
- **手順**:
  1. 一時トーナメント + プレイヤー1名 + entry 作成
  2. 一時ブラウザでログイン → `/ta/participant`
  3. 自分の20コース分のタイムを順次入力・送信
  4. 順位表に反映されること
  5. クリーンアップ
- **期待結果**: 参加者UIから自分の予選タイムを入力できる

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

---

## E2Eテスト実行ガイド

### セッション管理（重要）
- Playwright永続プロファイル（`/tmp/playwright-smkc-profile`）にDiscord OAuthセッションが保存されている
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

### TC-822: MR二重報告 — 管理者確定後のスコア変更不可 ❌ TEST EXISTS, FEATURE NOT IMPLEMENTED
- **URL**: /api/tournaments/[temp-id]/mr/match/[matchId]/report (POST)
- **authRequired**: true (admin)
- **背景**: `scoresConfirmed` フィールドが MRMatch スキーマに存在しないため、この機能は未実装
- **現状**: MRMatch テーブルに `scoresConfirmed` カラムがない。tc-mr.js に TC-822 が存在するがテストすると FAIL する（機能未実装のため）
- **tc-mr.js 内位置**: `runTc822` 関数（1338-1420行目付近）、テストスイート登録は TC-822
- **対応**: 必要に応じて feature request issue を作成または TC-822 をスキップリストに追加

### TC-820/821 実装確認 ✅ FIXED (PR #407)
- TC-820 (`runTc820` in tc-mr.js): MR match detail page view-only test
- TC-821 (`runTc821` in tc-gp.js): GP match detail page view-only test
- tc-mr.js と tc-gp.js で実行済み。PR #407 で MR/GP スコア入力フォームが admin から隠蔽された

### TC-316/322/324 文書化 ✅ ADDED (本PR)
- TC-316 (`e2e/tc-all.js` 行 1172-1280): BM 同順位バー抑制 regression test（mp=0非表示、マッチ後表示）
- TC-322 (`e2e/tc-bm.js` 行 148-223): BM スコア修正（Correct Score UI）テスト
- TC-324 (`e2e/tc-all.js` 行 1565): BM rankOverride 設定後の同城バー消滅テスト
- 上記3TCは実装済みだったが E2E_TEST_CASES.md に文書化が漏れていたため追加

### TC-802 未実装
- TC-802 TAプレイヤーログインからタイム入力: tc-ta.js に未実装（実装済みTCは TC-801/804/805/806/807/808 のみ）

### TC-803 統合済み
- TC-803 TAペア機能: TC-318 で既にカバー済みのため統合

### TC-108 実装済み
- TC-108 Players API ページネーション: `tc-all.js` に API 契約 + limit clamp + `/players` ページャー可視性チェックを追加

### TC-510 実装済み
- TC-510 BM Top-24 バラージ（Pre-Bracket Playoff）: `tc-bm.js` に `topN: 24` の playoff 作成、未完了409、R1→R2ルーティング、R2完了、Top-16 finals 生成、seed 13〜16 割当チェックを追加

### TC-317/319/807/808 文書化 ✅ ADDED (本PR)
- TC-317 (`e2e/tc-all.js` 行 828-877): TA シーディング CRUD — update_seeding が TTEntry に永続化される
- TC-319 (`e2e/tc-all.js` 行 972-1047): TA taPlayerSelfEdit フラグ toggle — false でセルフ編集ブロック
- TC-807 (`e2e/tc-ta.js` 行 277-379): TA Phase 3 ページが16名のエントリーを表示する
- TC-808 (`e2e/tc-ta.js` 行 381-472): TA Finals チャンピオン決定時にプロデューサーバナーが表示される
- 上記4TCは実装済みだったが E2E_TEST_CASES.md に文書化が漏れていたため追加

### TC-320/321 文書化 ✅ ADDED (本PR)
- TC-320 (`e2e/tc-all.js` 行 1282-1311): BM/MR/GP マッチリスト行レベルスコア入力リンク非表示化regression
- TC-321 (`e2e/tc-all.js` 行 1314-1419): BM match/[matchId] ページ view-only regression
- TC-320/321 は PR #407 の TC-820/821 対応に伴う regression テスト。実装済みだが文書化されていなかったため追加
