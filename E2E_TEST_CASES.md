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

## TC-516: BM 予選ページの決勝ブラケット存在状態 + リセット
- **URL**: /tournaments/[temp-id]/bm
- **authRequired**: true (admin)
- **背景**: 決勝ブラケット生成後に予選ページを再訪すると「View Tournament / トーナメントを見る」と「Reset Bracket / ブラケットリセット」が表示され、リセット後は「Generate Finals Bracket / Start Playoff」に戻る
- **手順**:
  1. 28名予選完了状態のトーナメントで qualificationConfirmed=true にし、Top-8 ブラケットを生成する
  2. 予選ページ（`/bm`）を開き「View Tournament」が表示されることを確認する
  3. 「Reset Bracket」ボタンをクリックし、確認ダイアログで OK を選択する
  4. リセット後に「Start Playoff / Generate Finals Bracket」ボタンが再表示されることを確認する
  5. クリーンアップ
- **期待結果**: ブラケット生成後は「View Tournament + Reset Bracket」、リセット後は「Generate / Start Playoff」に戻る

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

## TC-525: BM 決勝スコアダイアログ — 開始コースが選択時に自動保存される
- **背景**: スコアダイアログ内の「開始コース」ドロップダウンは、選択した瞬間に PATCH で永続化され、toast を表示する。スコア保存ボタンを押さなくても保存される（TV# と同じUI）。
- **手順**:
  1. 8名ブラケットを生成し `/bm/finals` に移動
  2. `bracket-match-card` をクリックしてスコアダイアログを開く（matchNumber=1）
  3. 開始コースドロップダウン (`#bm-finals-start-course`) で `2` （バトルコース2）を選択
  4. ダイアログが閉じないことを確認
  5. toast (`courseAssigned` または同等のメッセージ) が表示されることを確認
  6. API で matchNumber=1 の `startingCourseNumber` が 2 に永続化されていることを確認
  7. `null` （`-`）を選択するとクリアされ、API でも `null` になることを確認
- **期待結果**: 選択即保存。ダイアログを開いたまま開始コースだけが永続化される
- **スクリプト**: tc-bm.js TC-525

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
- **背景**: BM TC-516 の MR 版。決勝ブラケット生成後に予選ページを再訪すると「View Tournament」と「Reset Bracket」が表示され、リセット後は「Generate Finals Bracket / Start Playoff」に戻る
- **手順**:
  1. 28名予選完了状態のトーナメントで qualificationConfirmed=true にし、Top-8 ブラケットを生成する
  2. 予選ページ（`/mr`）を開き「View Tournament / トーナメントを見る」が表示されることを確認する
  3. 「Reset Bracket / ブラケットリセット」ボタンをクリックし、確認ダイアログで OK を選択する
  4. リセット後に「Start Playoff / Generate Finals Bracket」ボタンが再表示されることを確認する
  5. クリーンアップ
- **期待結果**: ブラケット生成後は「View Tournament + Reset Bracket」、リセット後は「Generate / Start Playoff」に戻る

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

## TC-621: MR ラウンド別 targetWins API バリデーション (issue #528)
- **背景**: MR 決勝ブラケットは `FT3/FT4/FT5` の任意設定が可能。BM TC-520 と対称。有効値は `[3, 4, 5]`、それ以外は 422 を返すこと
- **手順**:
  1. 28名予選完了済みフィクスチャで 8名ブラケットを生成する
  2. `PUT /mr/finals { matchId, targetWins: 3 }` → 200
  3. `PUT /mr/finals { matchId, targetWins: 6 }` → 422（無効値）
  4. `PUT /mr/finals { matchId, targetWins: 5 }` → 200
- **期待結果**: 有効値は受け付け、無効値は 422 で拒否される
- **スクリプト**: tc-mr.js TC-621

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

## TC-717: GP決勝 — 同じラウンドの全試合で同一カップ (PR #585 正規化)
- **URL**: /api/tournaments/[temp-id]/gp/finals (GET)
- **authRequired**: true (admin)
- **背景**: Playoff / Finals ブラケットでは「同じラウンドの試合はすべて同じカップ」(M1がFlowerならM2・M3・M4もFlower)。#583 の client-side random fallback が残した divergent state (M1=Flower, M2=Star, M3=null) は、GET 時に `normalizeRoundCupsToSingleCup` が同一カップへ収束させる。
- **手順**:
  1. 28名予選 + 決勝ブラケット生成（17試合）
  2. `GET /api/.../gp/finals` で全マッチ取得
  3. `round` で bucket し、各 round 内の `cup` 値が全て同じ・かつ非 null であることを確認
  4. クリーンアップ
- **期待結果**: winners_qf / winners_sf / winners_final / losers_r1..r3 / losers_sf / losers_final / grand_final / grand_final_reset の各ラウンドで、すべてのマッチが同一カップを保持

## TC-718: GP決勝 — 管理者の手動合計スコア入力 (PR #585 マニュアルフォーム)
- **URL**: /api/tournaments/[temp-id]/gp/finals (PUT)
- **authRequired**: true (admin)
- **背景**: 予選ページ同様、決勝の管理者ダイアログでチェックボックスをオンにすると 5レース入力をスキップして driver-points 合計を直接入力できる。body に `cup` / `races` が含まれない場合、保存済みのレース breakdown は温存されなければならない（`putAdditionalFields` が undefined なフィールドをスキップする契約）。
- **手順**:
  1. 28名予選 + 決勝ブラケット生成
  2. M1 に通常の `{ matchId, score1, score2, cup, races }` で PUT → races 配列が保存される
  3. 続けて M1 に `{ matchId, score1: 15, score2: 12 }` のみ（cup/races を**含まない**）で PUT → 200
  4. `GET` で M1 を再取得し、`points1=15`、`points2=12`、`cup` と `races` は手順 2 で保存した値のまま残っていることを確認
  5. クリーンアップ
- **期待結果**: 手動合計スコア PUT で score1/score2 は上書きされ、cup と races はクリアされない

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

## TC-712: GP 決勝 Grand Final サドンデス タイブレーク
- **URL**: /tournaments/[temp-id]/gp/finals (PUT M16)
- **authRequired**: true (admin)
- **背景**: Grand Final で GP ポイントが同点の場合、サドンデス勝者を指定する必要がある
- **手順**:
  1. 28名予選 + 決勝ブラケット生成
  2. M1〜M15 を API で入力して Grand Final (M16) まで進める
  3. M16 に同点スコア（score1=score2）で PUT → サドンデス勝者が設定されていなければ 400 が返ること
  4. `suddenDeathWinner` を含めて再 PUT → 200 が返り、チャンピオンが確定すること
  5. クリーンアップ
- **期待結果**: GP Grand Final 同点時のサドンデス勝者指定が正しく機能する

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
- **背景**: BM TC-515 / MR TC-615 の GP 版。`topN=24` で GP 決勝生成するとまず 8 試合のバラッジが生成される。UI が以下の流れを正しく提示すること: 予選ページ「Start Playoff」→ sessionStorage に `gp_finals_topN=24` 保存 → Finals ページ Playoff ブラケット表示 → playoff_r2 完了で playoffComplete=true → Phase 2（Upper Bracket）生成
- **手順**:
  1. 28名予選完了状態のトーナメントで qualificationConfirmed=true にし、既存ブラケットをリセットする
  2. 予選ページ（`/gp`）で「Start Playoff (バラッジ開始)」ボタンが表示されることを確認する
  3. ボタンをクリックし、sessionStorage の `gp_finals_topN` が `"24"` に設定されることを確認する
  4. `/gp/finals` に遷移し「Playoff (Barrage)」ラベルと M1 が表示されることを確認する
  5. playoff_r1 M1〜M4 を 9-0、playoff_r2 M5〜M8 を 9-0 で API 入力し、`playoffComplete=true` を確認する
  6. `POST /gp/finals { topN: 24 }` で Phase 2（Upper Bracket）を生成し `phase='finals'` が返ることを確認する
  7. `/gp/finals` に戻り「Upper Bracket / アッパーブラケット」が表示されることを確認する
  8. クリーンアップ
- **期待結果**: GP Top-24 バラッジの UI フローが全段階で正常動作する（sessionStorage 経由の topN 引き継ぎを含む）

## TC-716: GP 予選ページの決勝ブラケット存在状態 + リセット
- **URL**: /tournaments/[temp-id]/gp
- **authRequired**: true (admin)
- **背景**: BM TC-516 / MR TC-616 の GP 版。決勝ブラケット生成後に予選ページを再訪すると「View Tournament」と「Reset Bracket」が表示され、リセット後は「Generate Finals Bracket / Start Playoff」に戻る
- **手順**:
  1. 28名予選完了状態のトーナメントで qualificationConfirmed=true にし、Top-8 ブラケットを生成する
  2. 予選ページ（`/gp`）を開き「View Tournament / トーナメントを見る」が表示されることを確認する
  3. 「Reset Bracket / ブラケットリセット」ボタンをクリックし、確認ダイアログで OK を選択する
  4. リセット後に「Start Playoff / Generate Finals Bracket」ボタンが再表示されることを確認する
  5. クリーンアップ
- **期待結果**: ブラケット生成後は「View Tournament + Reset Bracket」、リセット後は「Generate / Start Playoff」に戻る

## TC-719: GP 決勝 — 非 Grand Final マッチでのサドンデス タイブレーク (issue #604)
- **背景**: GP の Grand Final 以外のブラケットマッチでも、同点（draws）発生時にサドンデスレースで決着できること
- **手順**:
  1. 28名予選完了済みフィクスチャで 8名ブラケットを生成する
  2. winners_qf の ready なマッチを取得する
  3. 引き分け状態（totalScore1 === totalScore2）が生じるようにスコアを PUT する
  4. GET で `isDraw=true` または `tiebreakApplied=true` が返ること
- **期待結果**: QF などの非 GF マッチでも同点は正しく処理される
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

## TC-823: モード公開トグル — レイアウトタブの「未公開」バッジがリアルタイム更新される (issue #621)
- **URL**: /tournaments/[id]/bm
- **authRequired**: true (admin)
- **背景**: 管理者がモード公開スイッチをクリックすると、`publicModesChanged` カスタムイベント経由でレイアウトがトーナメントデータを再 fetch し、タブの「未公開」バッジがページリロードなしに更新される
- **手順**:
  1. 新規トーナメントを作成する（publicModes=[]）
  2. `/bm` ページを開き、BM タブに `bg-destructive` バッジ（未公開マーカー）が表示されることを確認する
  3. 「バトルモード: 未公開」スイッチをクリックして公開に切り替える（3秒待機）
  4. タブバッジが消えていることを確認する
  5. 再度スイッチをクリックして未公開に戻す（3秒待機）
  6. タブバッジが再表示されることを確認する
  7. クリーンアップ
- **期待結果**: 公開トグル後、タブバッジがページリロードなしに追従する
- **スクリプト**: tc-all.js TC-823

---

## TT (Time Trial / TA) フルワークフローテスト  *(TC-801/802/804/805/806/807/808/809/810/811 実装済み)*

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

## TC-339: モード公開カスケード — `publicModes` 順次プレフィックス制約の検証
- **URL**: PUT /api/tournaments/:id
- **authRequired**: true (admin)
- **背景**: `publicModes` は `[ta, bm, mr, gp]` の先頭からの連続したプレフィックス
  でなければならない。公開ボタンはレイアウト（layout.tsx）の共通エリアに統一移動済み。
  `publishMode(bm)` は `["ta", "bm"]` を返し、`unpublishMode(ta)` は `[]` を返す。
  非プレフィックスの `["bm"]` などは API が 400 で拒否する。
- **手順**:
  1. トーナメント作成 → `PUT publicModes: ["ta", "bm"]` → 200 で `["ta", "bm"]` が返る
  2. `PUT publicModes: ["bm"]`（TA なしのギャップ）→ 400 VALIDATION_ERROR
  3. `GET /api/tournaments` を非認証で → 公開後のトーナメントが一覧に現れる
- **期待結果**:
  - `["ta", "bm"]` は受理され、`publicModes` に反映される
  - `["bm"]` は 400 で拒否される
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
- TC-510 BM Top-24 バラージ（Pre-Bracket Playoff）: `tc-bm.js` に `topN: 24` の playoff 作成、未完了409、R1→R2ルーティング、R2完了、Top-16 finals 生成、seed 13〜16 割当チェックを追加

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
- **背景**: 決勝ブラケット生成後、予選ページに戻ると「View Tournament」ボタンに切り替わり、adminには「Reset Bracket」ボタンが表示される。Reset後は再び「Generate Finals Bracket」に戻る
- **手順**:
  1. 8名決勝ブラケットを生成
  2. `/bm` に戻り、「View Tournament」と「Reset Bracket」ボタンが表示されることを確認
  3. 「Reset Bracket」をクリック（confirmダイアログをaccept）
  4. ページに「Generate Finals Bracket」ボタンが復帰することを確認
  5. クリーンアップ
- **期待結果**: finalsExists 状態の切り替えとブラケットリセットがUI上で正しく動作する
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
  2. `/mr` に戻り、「View Tournament」と「Reset Bracket」が表示されることを確認
  3. Reset 後、「Generate Finals Bracket」に戻ることを確認
  4. クリーンアップ
- **期待結果**: MRでもfinalsExists状態とリセットが正しく動作する
- **実装**: `tc-mr.js` `runTc616`

### TC-715: GP Top-24 Playoff UI Flow
- **URL**: /tournaments/[temp-id]/gp → /gp/finals
- **authRequired**: true (admin)
- **背景**: GPでもTop-24→Top-16 playoffフロー。`gp_finals_topN=24` を sessionStorage に保存
- **手順**:
  1. 28名GP予選完了後、`/gp` を開く
  2. 「Start Playoff (Top 24)」ボタンをクリック
  3. `sessionStorage.getItem('gp_finals_topN') === '24'` を確認
  4. `/gp/finals` で PlayoffBracket M1〜M8 が表示されることを確認
  5. playoff_r1/r2 をスコア入力（9-0、GP targetWins=3）
  6. Phase 2 で Upper Bracket 生成 → finals phase に切り替わることを確認
  7. クリーンアップ
- **期待結果**: GPでもTop-24 playoff UIフローが正しく動作する
- **実装**: `tc-gp.js` `runTc715`

### TC-716: GP 予選ページ finals-exists 状態 + Reset Bracket
- **URL**: /tournaments/[temp-id]/gp
- **authRequired**: true (admin)
- **手順**:
  1. 8名決勝ブラケットを生成
  2. `/gp` に戻り、「View Tournament」と「Reset Bracket」が表示されることを確認
  3. Reset 後、「Generate Finals Bracket」に戻ることを確認
  4. クリーンアップ
- **期待結果**: GPでもfinalsExists状態とリセットが正しく動作する
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
  3. 無認証 GET でポーリングし、`type='match_completed'`, `mode='bm'`, `subtitle` に "4-0", `title` に "BM" / "終了" を含むイベントが現れること
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
  4. スタック全体のテキストに `更新|確定|終了|申告|タイム` のいずれかが含まれる
- **期待結果**: 実ブラウザでトーストが表示される
- **備考**: 各イベント種別の中身は TC-903/907/908/910/909 等で個別に検証しているため、TC-906 はパイプライン疎通のみを担当

### TC-907: MR の `match_completed` イベント
- **手順**: MR 予選試合に admin PUT (3-1) → unauth poll で `type='match_completed'`, `mode='mr'`, subtitle に `3-1`, title に `MR` を含むイベントが現れる
- **期待結果**: 15 秒以内に取得できる

### TC-908: GP の `match_completed` イベント（points→score リマップ検証）
- **背景**: GP は DB 上 `points1/points2`（ドライバーポイント）、route で `score1/score2` にリマップしてから aggregator に渡す。この経路を E2E で確認
- **手順**: GP 予選試合の cup を取得 → `makeRacesP1Wins(cup)` で 5 レースの結果を生成 → admin PUT → unauth poll で `mode='gp'` の `match_completed` イベント
- **期待結果**: subtitle に `45-0`（5×9pts）形式のスコア、title に `GP` を含む

### TC-909: `qualification_confirmed` イベント
- **手順**: PUT `/api/tournaments/[id]` `{ qualificationConfirmed: true }` → unauth poll で `type='qualification_confirmed'`, title に `予選確定`
- **期待結果**: イベントが現れる
- **備考**: このフラグ ON 後は予選スコア編集が拒否されるため、score 系 TC の後に実行すること

### TC-910: `ta_time_recorded` イベント（予選＝合計タイム通知）
- **背景**: 予選は 20 コース × N 名分のスコア更新が発生するため、コースごとに通知すると過剰になる。予選ステージは `totalTime` が確定したタイミング（全 20 コース入力済み）で 1 回のみ発火する設計
- **手順**: 全 20 コース分の time map（`makeTaTimesForRank`）+ totalTime + rank を `apiSeedTtEntry` で 2 エントリに投入 → unauth poll で `type='ta_time_recorded'`, `mode='ta'`
- **期待結果**:
  - イベントが現れる
  - title が `[予選] {nickname} が予選を完走しました（タイム M:SS.cc, 現在 N 位）` 形式
  - `taTimeRecord` payload は `{ player, phaseLabel, rank, totalTimeMs, totalTimeFormatted }` を持ち、`course`/`time` は含まれない
- **備考**: PUT 経路の `recalculateRanks` が times から totalTime を再計算するため、部分的な time map（例: 4 コースだけ）だと totalTime=null になり予選通知は発火しない（敗者復活/決勝などの phase ステージは引き続きコースごとに通知）

### TC-911: `overall_ranking_updated` イベント
- **手順**: POST `/api/tournaments/[id]/overall-ranking`（空 body）→ unauth poll で `type='overall_ranking_updated'`
- **期待結果**: イベントが現れる

### TC-913: `ta_phase_advanced` イベント
- **手順**: TA 予選 totalTime + rank を 2 エントリに投入（TC-910 で済） → POST `/ta/phases` `{action:'promote_phase3'}` → POST `{action:'start_round', phase:'phase3'}` → unauth poll で `type='ta_phase_advanced'`, title に `phase3`
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

---

## E2Eテスト実行ガイド
