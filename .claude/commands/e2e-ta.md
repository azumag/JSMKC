# E2E タイムアタック予選〜決勝フローテスト

タイムアタック（TA）の予選から決勝までの全フローをagent-browserで自動テストする。
管理者操作とプレイヤー操作の両方をカバーし、トーナメント進行の整合性を検証する。
**プレイヤー数は引数で指定可能（デフォルト24名）。人数に応じてPhase構成が自動決定される。**

## 引数

- `$ARGUMENTS` : (省略可) 以下のオプションを組み合わせて指定
  - `--players N` : テストプレイヤー数（デフォルト: 24、最小: 4）
  - `--env dev` : 環境指定（デフォルト: dev）
  - `--skip-cleanup` : テスト後のデータ削除をスキップ
  - `--headed` : ブラウザ表示モード

## 前提条件

- 開発サーバーが起動していること (`npm run dev` at localhost:3000)
- データベースが接続可能であること
- 管理者のDiscord OAuthセッションまたはadmin認証状態が利用可能であること

## フェーズ構成の自動決定ロジック

プレイヤー数 P に応じて、テスト対象フェーズが変わる:

| プレイヤー数 P | Phase 1 | Phase 2 | Phase 3 |
|---------------|---------|---------|---------|
| P > 16 | ranks 17〜P (P-16名) → 4名生存 | Phase1生存4名 + ranks 13-16 (4名) = 8名 → 4名生存 | Phase2生存4名 + ranks 1-12 (12名) = 16名 |
| 13 <= P <= 16 | スキップ | ranks 13〜P (P-12名) + ダミー補充で8名 → 4名生存 | Phase2生存4名 + ranks 1-12 (12名) = 16名 |
| P <= 12 | スキップ | スキップ | 全P名で直接Phase 3 |

**Phase 1/2 の脱落ラウンド数 = エントリー人数 - 4（生存者数）**

## テストデータ

### テストプレイヤー

P名のプレイヤーを作成する（E2E Player 1 〜 E2E Player P）。

**命名規則:**
- Full Name: `E2E Player {N}` (N = 1〜P)
- Nickname: `e2e-player-{N}`
- パスワード: APIが自動生成（作成時に「Temporary Password」ダイアログから取得）

**フェーズ割り当て（P > 16の場合）:**
- Player 1〜12: Phase 3 直接参加
- Player 13〜16: Phase 2 から参加
- Player 17〜P: Phase 1 から参加

### テスト用タイムデータ（4コース）

各プレイヤーのタイムは確定的な順位を保証するため計算式で生成する:

**計算式:** Player N のタイム = ベースタイム + (N-1) * 3秒

| コース | ベースタイム (Player 1) |
|--------|----------------------|
| MC1 | 1:05.000 |
| DP1 | 1:12.000 |
| GV1 | 0:58.000 |
| BC1 | 1:20.000 |

**タイム例（計算式に基づいて動的生成）:**
- Player 1: MC1=1:05.000, DP1=1:12.000, GV1=0:58.000, BC1=1:20.000
- Player N: MC1 = 65 + (N-1)*3 秒, DP1 = 72 + (N-1)*3 秒, GV1 = 58 + (N-1)*3 秒, BC1 = 80 + (N-1)*3 秒
- M:SS.mmm 形式に変換して入力すること

## 実行手順

### Step 0: 引数パース・環境確認

```
=== E2E タイムアタックフローテスト開始 ===
引数: $ARGUMENTS
```

1. 引数をパースする:
   - `--players N` があれば P = N、なければ P = 24
   - P < 4 の場合はエラー終了（Phase 3に最低4名必要）
2. フェーズ構成を決定し表示:
```
プレイヤー数: P
Phase 1: {P > 16 ? "実行（" + (P-16) + "名）" : "スキップ"}
Phase 2: {P > 12 ? "実行" : "スキップ"}
Phase 3: 実行
```
3. スクリーンショット保存ディレクトリ作成
```bash
mkdir -p /tmp/e2e-ta
```
4. 開発サーバーの疎通確認
```bash
agent-browser open http://localhost:3000
agent-browser wait --load networkidle
agent-browser get title
agent-browser screenshot /tmp/e2e-ta/step0-homepage.png
```
5. サーバーがレスポンスを返さない場合はエラーで中断

### Step 1: 管理者ログイン (Admin Session)

管理者としてログインし、認証状態を確保する。

**方法A: 保存済み認証状態をロード**
```bash
test -f /tmp/e2e-ta/auth-state-admin.json
agent-browser open about:blank
agent-browser state load /tmp/e2e-ta/auth-state-admin.json
agent-browser open http://localhost:3000/tournaments
agent-browser wait --load networkidle
agent-browser get url
```

**方法B: 認証状態がない場合**
- `--env dev` の場合: AskUserQuestionツールを使ってユーザーにadminログインを促す
```bash
agent-browser open http://localhost:3000/auth/signin --headed
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser find text "管理者" click
agent-browser snapshot -i
agent-browser find text "Discordでログイン" click
# ユーザーにDiscordログイン完了を通知してもらう (AskUserQuestionツール使用)
agent-browser wait --load networkidle
agent-browser state save /tmp/e2e-ta/auth-state-admin.json
```

### Step 2: テストプレイヤー作成（P名）

プレイヤー管理ページでP名のプレイヤーを作成し、自動生成されたパスワードを取得する。

1. プレイヤー管理ページへ移動
```bash
agent-browser open http://localhost:3000/players
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser screenshot /tmp/e2e-ta/step2-players.png
```

2. P名のテストプレイヤーを作成

**各プレイヤー（N = 1〜P）について以下を実行:**
```bash
agent-browser find text "Add Player" click
agent-browser wait 500
agent-browser snapshot -i
agent-browser find label "Full Name" fill "E2E Player N"
agent-browser find label "Nickname" fill "e2e-player-N"
agent-browser find role button click --name "Add Player"
agent-browser wait --load networkidle
agent-browser snapshot -i
# Temporary Passwordダイアログからパスワードを取得
agent-browser get text [password-input-ref]
# PLAYER_N_PASSWORD として記録
agent-browser find text "I've Saved It" click
agent-browser wait 500
```

**重要:** snapshotで表示されるrefを確認し、read-onlyのinput要素からパスワードを取得すること。

3. プレイヤー一覧でP名が追加されたことを確認
```bash
agent-browser snapshot -i
agent-browser screenshot /tmp/e2e-ta/step2-players-created.png
```

**検証項目:**
- P名のプレイヤーが正常に作成される
- 各プレイヤーのTemporary Passwordが取得できる

### Step 3: テストトーナメント作成

1. トーナメント一覧ページへ移動
```bash
agent-browser open http://localhost:3000/tournaments
agent-browser wait --load networkidle
agent-browser snapshot -i
```

2. 新規トーナメントを作成
```bash
agent-browser find text "Create Tournament" click
agent-browser wait 500
agent-browser snapshot -i
agent-browser find label "Tournament Name" fill "E2E Test Tournament"
agent-browser find label "Date" fill "{today: YYYY-MM-DD}"
agent-browser find role button click --name "Create Tournament"
agent-browser wait --load networkidle
agent-browser screenshot /tmp/e2e-ta/step3-tournament-created.png
```

3. 作成されたトーナメントIDをURLから取得して記録

### Step 4: タイムアタックにプレイヤーを追加

1. TAページへ移動
```bash
agent-browser open http://localhost:3000/tournaments/{tournamentId}/ta
agent-browser wait --load networkidle
agent-browser snapshot -i
```

2. P名のプレイヤーをTAに追加

**各プレイヤー（N = 1〜P）について:**
```bash
agent-browser find text "Add Player" click
agent-browser wait 500
agent-browser snapshot -i
agent-browser find role combobox click
agent-browser wait 300
agent-browser find text "e2e-player-N" click
agent-browser wait --load networkidle
```

3. スタンディングテーブルにP名が表示されることを確認
```bash
agent-browser snapshot -i
agent-browser screenshot /tmp/e2e-ta/step4-players-added.png
```

**検証項目:**
- P名がTA予選にエントリーされる
- スタンディングで全員の進捗が 0/20 であること

### Step 5: 管理者からのタイム入力（P名分）

**最初に "Time Entry" タブへ切り替える:**
```bash
agent-browser snapshot -i
agent-browser find text "Time Entry" click
agent-browser wait 500
agent-browser snapshot -i
```

**各プレイヤー（N = 1〜P）について:**

タイム計算: Player N = ベースタイム + (N-1) * 3秒
- MC1: 65 + (N-1)*3 秒 → M:SS.000 形式
- DP1: 72 + (N-1)*3 秒 → M:SS.000 形式
- GV1: 58 + (N-1)*3 秒 → M:SS.000 形式
- BC1: 80 + (N-1)*3 秒 → M:SS.000 形式

```bash
agent-browser snapshot -i
# e2e-player-N の行の "Edit Times" ボタンをクリック
agent-browser find text "Edit Times" click
agent-browser wait 500
agent-browser snapshot -i
# snapshotのrefでinput欄を特定してタイムを入力
agent-browser fill [mc1-input-ref] "{MC1タイム}"
agent-browser fill [dp1-input-ref] "{DP1タイム}"
agent-browser fill [gv1-input-ref] "{GV1タイム}"
agent-browser fill [bc1-input-ref] "{BC1タイム}"
agent-browser find text "Save Times" click
agent-browser wait --load networkidle
```

```bash
agent-browser screenshot /tmp/e2e-ta/step5-times-entered.png
```

**検証項目:**
- タイムが正常に保存される
- 進捗が 4/20 に更新される
- 順位がPlayer1(1位) 〜 PlayerP(P位)の順になること

### Step 6: プレイヤーログインとタイム入力

**テスト対象: e2e-player-1**

1. 管理者セッションを保存し、プレイヤーとしてログイン
```bash
agent-browser state save /tmp/e2e-ta-admin-state.json
agent-browser close
agent-browser open http://localhost:3000/auth/signin
agent-browser wait --load networkidle
agent-browser snapshot -i
# ログインページは日本語UI
agent-browser find label "ニックネーム" fill "e2e-player-1"
agent-browser find label "パスワード" fill "{PLAYER_1_PASSWORD}"
agent-browser find text "ログイン" click
agent-browser wait --load networkidle
agent-browser screenshot /tmp/e2e-ta/step6-player-login.png
```

2. TA参加者ページでタイム更新
```bash
agent-browser open http://localhost:3000/tournaments/{tournamentId}/ta/participant
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser fill [mc1-input-ref] "1:03.000"
agent-browser find text "Submit Times" click
agent-browser wait --load networkidle
agent-browser screenshot /tmp/e2e-ta/step6-player-time-updated.png
```

**検証項目:**
- プレイヤーが自動生成パスワードでログインできる
- プレイヤーが自分のタイムを更新できる

### Step 7: 管理者に戻り予選スタンディング確認

```bash
agent-browser close
agent-browser open about:blank
agent-browser state load /tmp/e2e-ta-admin-state.json
agent-browser open http://localhost:3000/tournaments/{tournamentId}/ta
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser screenshot /tmp/e2e-ta/step7-qualification-standings.png
```

**検証項目:**
- P名全員のスタンディングが正しい順序で表示される
- Player1のMC1タイムが1:03.000に更新されている

### Step 8: 予選から決勝への進行（Promote to Finals）

P名全員をFinalsに進出させる。

```bash
agent-browser snapshot -i
agent-browser find text "Promote to Finals" click
agent-browser wait 500
agent-browser snapshot -i
agent-browser find label "Number of players to promote" fill "{P}"
agent-browser find role button click --name "Promote to Finals"
agent-browser wait --load networkidle
agent-browser screenshot /tmp/e2e-ta/step8-promoted.png
```

**APIがtopN=Pを拒否する場合、Manual Selectionモードを使用:**
```bash
agent-browser find text "Manual Selection" click
agent-browser wait 300
# 各プレイヤーのチェックボックスをクリック（全P名）
agent-browser find role button click --name "Promote to Finals"
agent-browser wait --load networkidle
```

**検証項目:**
- P名全員がFinalsに進出する

### Step 9: Phase 1（Losers Round 1）— P > 16 の場合のみ実行

**条件: P > 16 の場合のみ。P <= 16 ならこのStepをスキップ。**

Phase 1: 予選ランク17〜Pの (P-16)名が参加。1コースずつ最遅1名を脱落させ、4名になるまで続ける。
**ラウンド数 = (P-16) - 4 = P-20 回**

1. Phase 1を開始
```bash
agent-browser snapshot -i
agent-browser find text "Start Phase 1" click
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser find text "Go to Phase 1" click
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser screenshot /tmp/e2e-ta/step9-phase1-page.png
```

**検証項目（Phase 1開始）:**
- Phase 1に(P-16)名のプレイヤー（ranks 17〜P）がエントリーされていること
- 全員が "Active" であること

2. Phase 1 エリミネーションラウンドを (P-20) 回実行

**各ラウンド:**
```bash
agent-browser find text "Round Control" click
agent-browser wait 300
agent-browser snapshot -i
agent-browser find text "Start Round" click
agent-browser wait --load networkidle
agent-browser snapshot -i
# 各アクティブプレイヤーのタイムを入力
# 番号が大きいプレイヤーに遅いタイムを設定（+3秒ずつ）
agent-browser fill [player-input-ref] "{time}"
agent-browser find text "Submit & Eliminate Slowest" click
agent-browser wait --load networkidle
agent-browser screenshot /tmp/e2e-ta/step9-phase1-round{R}-result.png
```

**脱落順:** 番号が大きいプレイヤーから順に脱落（Player P → Player P-1 → ... → Player 21）

3. Phase 1 完了確認
```bash
agent-browser snapshot -i
agent-browser screenshot /tmp/e2e-ta/step9-phase1-complete.png
```

**検証項目（Phase 1完了）:**
- "Phase Complete" バナーが表示される
- 生存者4名: e2e-player-17, e2e-player-18, e2e-player-19, e2e-player-20
- (P-20)ラウンドの結果がRound Historyに記録されていること

4. TAページに戻る
```bash
agent-browser open http://localhost:3000/tournaments/{tournamentId}/ta
agent-browser wait --load networkidle
```

### Step 10: Phase 2（Losers Round 2）— P > 12 の場合のみ実行

**条件: P > 12 の場合のみ。P <= 12 ならこのStepをスキップ。**

Phase 2の構成:
- **P > 16**: Phase 1生存者4名 + 予選ランク13-16の4名 = 8名
- **13 <= P <= 16**: ランク13〜Pの (P-12)名。(P-12) < 8 の場合、そのままの人数で実施し 4名まで脱落

**ラウンド数 = Phase 2 エントリー人数 - 4**

1. Phase 2を開始
```bash
agent-browser snapshot -i
agent-browser find text "Start Phase 2" click
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser find text "Go to Phase 2" click
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser screenshot /tmp/e2e-ta/step10-phase2-page.png
```

**検証項目（Phase 2開始）:**
- エントリー人数が正しいこと
- 全員が "Active" であること

2. Phase 2 エリミネーションラウンドを実行

Phase 1と同じパターン。番号が大きいプレイヤーに遅いタイムを設定。

**P > 16 の場合の脱落順:**
Phase 1 survivors (17-20) は qualification ranks 13-16 より遅いため先に脱落:
- e2e-player-20 → e2e-player-19 → e2e-player-18 → e2e-player-17

3. Phase 2 完了確認
```bash
agent-browser snapshot -i
agent-browser screenshot /tmp/e2e-ta/step10-phase2-complete.png
```

**検証項目（Phase 2完了）:**
- "Phase Complete" バナーが表示される
- 生存者4名が確認できること
- Round Historyにラウンド結果が記録されていること

4. TAページに戻る
```bash
agent-browser open http://localhost:3000/tournaments/{tournamentId}/ta
agent-browser wait --load networkidle
```

### Step 11: Phase 3（Finals）のテスト

Phase 3の構成:
- **P > 16**: Phase 2生存者4名 + ranks 1-12 (12名) = 16名
- **13 <= P <= 16**: Phase 2生存者4名 + ranks 1-12 (12名) = 16名
- **P <= 12**: 全P名で直接Phase 3

ライフ制決勝: 各コースで下位半分がライフ-1。ライフ0で脱落。残り8名/4名/2名到達時にライフリセット(3)。

1. Phase 3を開始
```bash
agent-browser snapshot -i
agent-browser find text "Start Phase 3" click
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser find text "Go to Finals" click
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser screenshot /tmp/e2e-ta/step11-finals-page.png
```

**検証項目（Phase 3開始）:**
- Phase 3に正しい人数がエントリーされていること
- 全員のライフが3であること

2. Phase 3 ラウンドを繰り返し実行

```bash
agent-browser find text "Round Control" click
agent-browser wait 300
agent-browser find text "Start Round" click
agent-browser wait --load networkidle
agent-browser snapshot -i
# 各プレイヤーのタイムを入力（番号大 = 遅いタイム）
agent-browser fill [player-input-ref] "{time}"
agent-browser find text "Submit & Deduct Lives" click
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser screenshot /tmp/e2e-ta/step11-phase3-round{R}-result.png
```

**Phase 3 のライフ制ルール:**
- アクティブ人数の下位半分がライフ-1
- ライフ0で脱落(eliminated)
- **ライフリセット閾値**: 残りアクティブ人数が 8名/4名/2名 に到達 → 全員ライフ3にリセット

**目標: 最低でも「残り8名でのライフリセット」を確認するまでラウンドを繰り返す。**
理想的には「残り4名でのライフリセット」まで確認する。

**検証項目（Phase 3ラウンド）:**
- 下位半分のプレイヤーのライフが1減少すること
- ライフ0のプレイヤーが脱落すること
- ライフリセット: 残り8名到達時にライフが3にリセットされること
- ライフリセット: 残り4名到達時にライフが3にリセットされること（可能であれば）

```bash
agent-browser screenshot /tmp/e2e-ta/step11-phase3-standings.png
```

### Step 12: ブラウザクリーンアップ

```bash
agent-browser close
```

### Step 13: テスト結果レポート

テスト結果を標準出力にサマリーとして報告する（ファイル生成は行わない）。

**報告内容:**
1. テスト実行情報（日時、環境、プレイヤー数P）
2. 各ステップの成功/失敗
3. **Phase 1テスト結果（P > 16の場合のみ）:**
   - エントリー人数（P-16名）
   - ラウンド数（P-20回）
   - 脱落者と生存者
4. **Phase 2テスト結果（P > 12の場合のみ）:**
   - エントリー人数
   - ラウンド数
   - 脱落者と生存者
5. **Phase 3テスト結果:**
   - エントリー人数
   - 実行ラウンド数
   - ライフ減少・脱落の動作確認結果
   - ライフリセット確認結果
6. 発見された問題のリスト
7. スクリーンショット保存場所: `/tmp/e2e-ta/`

### Step 14: GitHub Issue作成（問題発見時のみ）

**テストで問題が発見された場合のみ** issueを作成する。

```bash
gh issue create \
  --title "E2E TA Test: [問題の概要]" \
  --body "$(cat <<'EOF'
## E2E タイムアタックフローテスト - 不具合報告

### テスト情報
- 実行日時: [timestamp]
- 環境: 開発環境 (localhost:3000)
- プレイヤー数: P
- 該当ステップ: Step [N]

### 問題の詳細
[具体的なエラー内容や期待値との差異]

### スクリーンショット
/tmp/e2e-ta/ ディレクトリ参照

### 再現手順
[問題の再現手順]
EOF
)" \
  --label "bug,e2e"
```

## テストケース一覧

| TC-ID | テスト名 | 条件 |
|-------|---------|------|
| TC-TA-001 | 開発サーバーの疎通確認 | 常時 |
| TC-TA-002 | 管理者ログイン | 常時 |
| TC-TA-003 | プレイヤー作成（P名）と自動生成パスワード取得 | 常時 |
| TC-TA-004 | トーナメント作成 | 常時 |
| TC-TA-005 | TAへのプレイヤー追加（P名） | 常時 |
| TC-TA-006 | 管理者からのタイム入力（P名x4コース） | 常時 |
| TC-TA-007 | 予選スタンディング表示 | 常時 |
| TC-TA-008 | プレイヤーログイン(自動生成PW) | 常時 |
| TC-TA-009 | プレイヤーTA参加者ページ | 常時 |
| TC-TA-010 | プレイヤーからのタイム入力 | 常時 |
| TC-TA-011 | タイム更新後のスタンディング確認 | 常時 |
| TC-TA-012 | 予選→決勝のプロモーション（P名全員） | 常時 |
| TC-TA-013 | Phase 1 開始 | P > 16 |
| TC-TA-014 | Phase 1 ラウンド実行 | P > 16 |
| TC-TA-015 | Phase 1 完了確認 | P > 16 |
| TC-TA-016 | Phase 2 開始 | P > 12 |
| TC-TA-017 | Phase 2 ラウンド実行 | P > 12 |
| TC-TA-018 | Phase 2 完了確認 | P > 12 |
| TC-TA-019 | Phase 3 開始 | 常時 |
| TC-TA-020 | Phase 3 ラウンド実行（ライフ制） | 常時 |
| TC-TA-021 | Phase 3 ライフ減少・脱落・リセット確認 | 常時 |
| TC-TA-022 | 全フェーズ連携フロー | 常時 |

## 実行上の注意事項

### UI言語について
- **ログインページのみ日本語UI**: 「ニックネーム」「パスワード」「ログイン」「管理者」「Discordでログイン」
- **その他すべてのページは英語UI**: "Add Player", "Create Tournament", "Edit Times", "Save Times", "Submit Times", "Promote to Finals", "Start Phase 1/2/3", "Go to Phase 1/2", "Go to Finals", "Start Round", "Submit & Eliminate Slowest", "Submit & Deduct Lives" 等

### パスワードの取扱い
- プレイヤーのパスワードは作成時にAPIが自動生成する（手動指定不可）
- 作成後に表示される「Temporary Password」ダイアログから`agent-browser get text`で読み取る
- 各プレイヤーのパスワードを変数として保持し、ログイン時に使用する
- **P名分のパスワードをすべて保持する必要がある**（ログインテストは1名のみ）

### 要素の検出について
- agent-browser の `snapshot -i` で取得したrefを使用してインタラクションする
- UI要素が見つからない場合は `find` コマンドでセマンティックに検索する
- **タイム入力欄**: Label要素にhtmlFor属性がないため、snapshotで取得したrefを使って `agent-browser fill [ref] "value"` で直接入力する
- ダイアログの表示に時間がかかる場合は `wait 500` で待機する
- ページ遷移後は必ず `wait --load networkidle` を実行する

### Phase 1/Phase 2 ページのUI
- **タブ構成**: Standings / Round History / Round Control / Current Round（ラウンド中のみ）
- **ラウンド開始**: "Round Control" タブ → "Start Round N" ボタン
- **タイム入力**: "Current Round" タブに各プレイヤーの入力欄
- **結果送信**: "Submit & Eliminate Slowest" ボタン（最遅1名が脱落）
- **完了表示**: 目標生存者数到達で "Phase Complete" バナー

### Phase 3（Finals）ページのUI
- Phase 1/2と異なるコンポーネント（ta/finals/page.tsx）
- **送信ボタン**: "Submit & Deduct Lives"
- **ライフ表示**: 各プレイヤーのライフ数が表示される
- **ライフリセット**: 残り8名/4名/2名到達時に全員ライフ3にリセット

### セッション管理
- `state load` を使う前に `agent-browser open about:blank` でブラウザインスタンスを開いておく
- 管理者↔プレイヤー切替時は: close → open about:blank → state load → open target URL

### エラーハンドリング
- 各ステップでスクリーンショットを撮影
- 要素が見つからない場合は再度snapshotを取得してrefを更新
- タイムアウト時はリトライ（最大3回）
- 致命的エラーの場合はそこまでの結果を報告して終了

### テストデータのクリーンアップ
- `--skip-cleanup` が指定されていない場合、テスト終了後にテストデータを削除
- 削除対象: テストトーナメント、テストプレイヤー（e2e-player-* のニックネーム、P名分）
- クリーンアップはAPI経由で実行（DELETEリクエスト）

### セキュリティ
- 認証状態ファイルを `.gitignore` に追加すること
- 本番環境での実行は禁止
