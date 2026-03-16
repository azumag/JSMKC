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

## E2Eテスト実行ガイド

### ページ中身の確認ルール（重要）
E2Eテストでは以下を必ず確認すること：
1. **エラーメッセージの不在**: `Failed to fetch`, `500`, `再試行` が表示されていないこと
2. **コンテンツの存在**: トーナメント名、モード名、ボタン等が実際に表示されていること
3. **ローディング完了**: `読み込み中` が消えていること

HTTPステータスコード200だけでは不十分。ページの`textContent`を取得して上記を検証すること。
