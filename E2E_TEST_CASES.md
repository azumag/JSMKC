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

## フルワークフローテスト

## TC-401: MR予選グループ設定→スコア入力→順位表確認
- **URL**: /tournaments/[id]/mr
- **authRequired**: true (admin)
- **手順**:
  1. MR予選ページで「グループ設定」をクリック
  2. 4名以上のプレイヤーを選択、グループAに割り当て
  3. 「グループ作成」をクリック → ダイアログが閉じること
  4. 順位表タブにプレイヤーが表示されること
  5. 試合一覧タブに試合が作成されていること
  6. 任意の試合でスコア入力 → 保存成功
  7. 順位表に結果が反映されること
  8. **クリーンアップ**: グループ編集で再作成（データリセット）
- **期待結果**: グループ作成→スコア入力→順位表反映の一連のフローが正常動作

## TC-402: GP予選グループ設定→スコア入力→順位表確認
- **URL**: /tournaments/[id]/gp
- **authRequired**: true (admin)
- **手順**:
  1. GP予選ページで「グループ設定」をクリック
  2. 4名以上のプレイヤーを選択、グループAに割り当て
  3. 「グループ作成」をクリック → ダイアログが閉じること
  4. 順位表タブにプレイヤーが表示されること
  5. 試合一覧タブに試合が作成されていること（カップ割り当て付き）
  6. 任意の試合でカップ選択 → 5コースが固定順で自動入力されること
  7. 各レースの順位（1-8）を入力 → 保存成功
  8. 順位表にドライバーズポイントが反映されること
  9. 必要に応じて管理者が合計ポイントのみ手動修正できること
  10. **クリーンアップ**: グループ編集で再作成（データリセット）
- **期待結果**: グループ作成→カップ選択→コース自動入力→順位入力→順位表反映の一連のフローが正常動作

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

## TC-503: BM決勝ブラケット生成とスコア入力
- **URL**: /tournaments/[temp-id]/bm/finals
- **authRequired**: true (admin)
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー8名を作成する
  2. BMグループ設定を行い、全予選マッチのスコアをAPIで入力して完了させる
  3. `/tournaments/[temp-id]/bm/finals` を開き、「Generate Bracket」ボタンをクリックする
  4. 確認ダイアログで「Top 8」を選択し、「Generate」をクリックする
  5. ダブルイリミネーションブラケットが表示されることを確認する（QF 4試合が表示）
  6. QF Match #1 をクリックし、スコア入力ダイアログが開くことを確認する
  7. score1=5, score2=2（best-of-9）を入力し「Save Score」をクリックする
  8. ブラケットが更新され、勝者がWinners Bracket次ラウンドに、敗者がLosers Bracketに移動することを確認する
  9. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: ブラケット生成、スコア入力、勝敗によるブラケット進行が正常に動作する

## TC-504: BM決勝ブラケットリセット
- **URL**: /tournaments/[temp-id]/bm/finals
- **authRequired**: true (admin)
- **手順**:
  1. TC-503と同様にブラケットを生成し、一部スコアを入力する
  2. 「Reset Bracket」ボタンをクリックする
  3. 確認ダイアログで「Reset」をクリックする
  4. ブラケットが再生成され、入力済みスコアがリセットされることを確認する
  5. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: ブラケットリセットが正常に機能し、全マッチがpending状態に戻る

## TC-505: BM決勝 Grand Final → チャンピオン決定
- **URL**: /tournaments/[temp-id]/bm/finals
- **authRequired**: true (admin)
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー8名を作成する
  2. BMグループ設定→全予選マッチ完了→ブラケット生成する
  3. 全ブラケットマッチ（Winners QF〜Grand Final）のスコアをAPIで入力する
     - Winners Bracket: QF(1-4), SF(5-6), WF(7)
     - Losers Bracket: L_R1(8-9), L_R2(10-11), L_R3(12-13), LSF(14), LF(15)
     - Grand Final(16): best-of-9
  4. Grand FinalでWinners側が勝った場合、チャンピオンカードが表示されることを確認する
  5. チャンピオンのニックネームが正しく表示されることを確認する
  6. 進行バッジが「Tournament Complete」を示すことを確認する
  7. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: 全マッチ完了後にチャンピオンが正しく決定・表示される

## TC-506: BM決勝 Grand Final Reset Match
- **URL**: /tournaments/[temp-id]/bm/finals
- **authRequired**: true (admin)
- **背景**: Grand FinalでLosers側が勝った場合、Reset Match（17試合目）が発生する
- **手順**:
  1. TC-505と同様に全マッチを進め、Grand Final(16)でLosers側勝者が勝つようにスコアを入力する
  2. Grand Final Reset(17)マッチがブラケットに出現することを確認する
  3. Reset Matchのスコアを入力する
  4. チャンピオンが正しく決定されることを確認する
  5. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: Grand Final Resetが正しくトリガーされ、最終勝者がチャンピオンとなる

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

---

## MR (Match Race) フルワークフローテスト

### 設計方針
- BMテスト(TC-5xx)と対称に構成。BMとの差異（決勝がレース形式、コース割当あり）以外は同じシナリオ
- 予選プレイヤー数: 12名（3グループ×4名）
- シード入力・推奨グループ数・自動振り分けをカバー
- プレイヤー側の試合リストからの「スコア入力」リンクテスト(TC-307相当)はMRでは不要

## TC-601: MR予選フルフロー（12名、シード、推奨グループ、自動振り分け）
- **URL**: /tournaments/[temp-id]/mr
- **authRequired**: true (admin)
- **手順**:
  1. 管理者セッションで一時トーナメントと12名のプレイヤーを作成する
  2. MR予選グループ設定APIで12名をシード1〜12で登録、3グループ（A/B/C × 4名）に自動振り分けする
     - シードはsnake配分: A=[1,6,7,12], B=[2,5,8,11], C=[3,4,9,10]
  3. APIレスポンスでグループごとに4名が割り当てられていることを確認する
  4. 各グループの全試合（4名RR = 6試合 × 3グループ = 18試合）のスコアをAPIで入力する
     - score1+score2=4 のルールを遵守（例: 3-1, 2-2, 4-0 等）
  5. MR予選ページを開き、順位表に全12名が表示されることを確認する
  6. 各グループの順位表がscore desc → points descで正しくソートされていることを確認する
  7. コース割当がランダムシャッフルされていることを確認する（rounds配列にcourse情報あり）
  8. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: 12名3グループのMR予選がシード・自動振り分けで正しく設定・実行・集計される

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

## TC-604: MR決勝ブラケット生成とスコア入力
- **URL**: /tournaments/[temp-id]/mr/finals
- **authRequired**: true (admin)
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー8名を作成する
  2. MRグループ設定を行い、全予選マッチのスコアをAPIで入力して完了させる
  3. `/tournaments/[temp-id]/mr/finals` を開き、「Generate Bracket」ボタンをクリックする
  4. 確認ダイアログで「Top 8」を選択し、「Generate」をクリックする
  5. ダブルイリミネーションブラケットが表示されることを確認する（QF 4試合が表示）
  6. QF Match #1 をクリックし、スコア入力ダイアログが開くことを確認する
  7. **MR固有**: レーステーブルでコース選択＋勝者選択を行う。P1が3勝（best-of-5でfirst-to-3）になるよう入力
  8. 「Save Result」をクリックする
  9. ブラケットが更新され、勝者がWinners Bracket次ラウンドに、敗者がLosers Bracketに移動することを確認する
  10. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: MR決勝ブラケット生成、レース形式スコア入力、勝敗によるブラケット進行が正常に動作する

## TC-605: MR決勝ブラケットリセット
- **URL**: /tournaments/[temp-id]/mr/finals
- **authRequired**: true (admin)
- **手順**:
  1. TC-604と同様にブラケットを生成し、一部スコアを入力する
  2. 「Reset Bracket」ボタンをクリックする
  3. 確認ダイアログで「Reset」をクリックする
  4. ブラケットが再生成され、入力済みスコアがリセットされることを確認する
  5. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: ブラケットリセットが正常に機能し、全マッチがpending状態に戻る

## TC-606: MR決勝 Grand Final → チャンピオン決定
- **URL**: /tournaments/[temp-id]/mr/finals
- **authRequired**: true (admin)
- **手順**:
  1. 管理者セッションで一時トーナメントとプレイヤー8名を作成する
  2. MRグループ設定→全予選マッチ完了→ブラケット生成する
  3. 全ブラケットマッチ（Winners QF〜Grand Final）のスコアをAPIで入力する
     - Winners Bracket: QF(1-4), SF(5-6), WF(7)
     - Losers Bracket: L_R1(8-9), L_R2(10-11), L_R3(12-13), LSF(14), LF(15)
     - Grand Final(16): **MR固有** best-of-5レース（first-to-3）
  4. Grand FinalでWinners側が勝った場合、チャンピオンカードが表示されることを確認する
  5. チャンピオンのニックネームが正しく表示されることを確認する
  6. 進行バッジが「Tournament Complete」を示すことを確認する
  7. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: 全マッチ完了後にチャンピオンが正しく決定・表示される

## TC-607: MR決勝 Grand Final Reset Match
- **URL**: /tournaments/[temp-id]/mr/finals
- **authRequired**: true (admin)
- **背景**: Grand FinalでLosers側が勝った場合、Reset Match（17試合目）が発生する
- **手順**:
  1. TC-606と同様に全マッチを進め、Grand Final(16)でLosers側勝者が勝つようにスコアを入力する
  2. Grand Final Reset(17)マッチがブラケットに出現することを確認する
  3. Reset Matchのスコアを入力する（MR形式のレース入力）
  4. チャンピオンが正しく決定されることを確認する
  5. 一時トーナメントと一時プレイヤーを削除する
- **期待結果**: Grand Final Resetが正しくトリガーされ、最終勝者がチャンピオンとなる

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

## E2Eテスト実行ガイド

### セッション管理（重要）
- Playwright永続プロファイル（`/tmp/playwright-smkc-profile`）にDiscord OAuthセッションが保存されている
- **テスト中にログイン/ログアウトは行わない** — セッションを消費しないこと
- 認証不要TCも認証ありTCも同じセッションで連続実行する
- プレイヤー credentials ログインの検証は、管理者の永続プロファイルを壊さないよう別の一時ブラウザコンテキストで行う
- TC-107（Forbidden確認）は `https` モジュールで認証なしリクエストを送る（ブラウザセッションを使わない）
- TC-304（観覧者メッセージ）も同様に `https` で認証なしHTMLを取得して確認

### スクリプト構成
- `e2e/tc-all.js` — 全TCを1つのスクリプトで実行（セッション維持）
- `e2e/tc-bm.js` — BM専用テスト（TC-322, TC-323）
- `e2e/tc-mr.js` — MR専用テスト（TC-601〜TC-610）

### ページ中身の確認ルール（重要）
E2Eテストでは以下を必ず確認すること：
1. **エラーメッセージの不在**: `Failed to fetch`, `500`, `再試行` が表示されていないこと
2. **コンテンツの存在**: トーナメント名、モード名、ボタン等が実際に表示されていること
3. **ローディング完了**: `読み込み中` が消えていること

HTTPステータスコード200だけでは不十分。ページの`innerText`を取得して上記を検証すること（`textContent`はi18n JSONを含むため使用不可）。
