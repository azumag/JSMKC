# CDM 2026 受け入れテスト実行ガイド

Issue #3050 の受け入れテストを実施する際の、preview 環境向け自動チェックと手動確認の境界をまとめる。

## 自動チェック: TC-3040 BM / MR / GP

CDM 2026 のバラージ訂正後 Upper 再調整については、BM・MR・GP の `TC-3040` を次の1コマンドで順番に実行できる。

```bash
cd smkc-score-app
npm run e2e:preview:cdm-reconciliation
```

このコマンドは内部で `E2E_TESTS=TC-3040` を設定し、次の順序で実行する。

1. `tc-bm.js`
2. `tc-mr.js`
3. `tc-gp.js`

途中のスイートが非0終了した場合、その時点で後続スイートを実行せず失敗コードを返す。各スイートは既存の `run-preview.js` を通るため、preview URL の解決、D1 schema preflight、管理者セッション preflight も従来どおり実行される。

### 事前準備

preview 用の管理者プロファイルが未作成・失効している場合は、先に次を実行する。

```bash
cd smkc-score-app
npm run e2e:preview:login
```

既定の preview URL 以外を使う場合は、既存 runner と同様に `E2E_BASE_URL` を指定する。

## 手動確認が必要な項目

上記コマンドは Issue #3050 の受け入れテスト全体を代替しない。少なくとも次は実環境で別途確認する。

- Issue #3050 に列挙された P0 受け入れケース全体
- UI 表示と操作フロー
- CDM XLSM を Excel で開いた際のマクロ・数式・シード・結果
- アーカイブ／復元を含む実運用フロー
- 実施環境、commit SHA、DB migration version、実施者、実施日、Browser / Excel version の記録

自動チェックが PASS しても、上記の手動確認が未完了なら Issue #3050 を完了扱いにはしない。
