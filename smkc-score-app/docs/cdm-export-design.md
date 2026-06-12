# CDM 試合結果シート生成 — 設計書

対象: `GET /api/tournaments/[id]/export?format=cdm`（admin専用）の全面再設計。
テンプレート: `public/templates/cdm-2025-template.xlsm`（CDM 2025 実イベントの完成ワークブックと同一内容）。

## 1. 背景と根拠

CDM ワークブックは **VBAマクロなし**・**Excel 動的配列数式駆動**である。
順位表（SUMIF/SORTBY）・決勝ブラケット進行（`IF(COUNTA(scores)<2,"Winner of X",INDEX(SORTBY(...)))`）・
総合ランキング（全シートへのXLOOKUP）はすべて数式が自動計算し、人間が入力するのは
**試合スコア・シード番号・タイムのみ**。

旧実装（@e965/xlsx で read→write）は実測で以下が確認された:

1. `xl/tables/*.xml`（Registration / Tracks / Cups）と `xl/richData/*`（国旗画像）が
   **write時に欠落** → 全シートの `Registration[...]` 構造化参照が `#NAME?` となり数式網が全壊。
2. スピル範囲（例: BM Qualifications `E2:Q47` のアンカー配下）へ静的値を書くため、
   Excel で開くと `#SPILL!` エラー。
3. TT タイムをミリ秒整数で書いていたが、シートの期待形式は `M*10000+SS*100+CC`
   （例 1:10.34 → `11034`）。
4. 決勝シートのシード番号セル（数値）へニックネーム文字列を書き込み → `XLOOKUP` が `#N/A`。

よって方式を **「ZIP外科手術によるテンプレート充填」** に置き換える。
入力セルのみを書き換え、その他のパート（tables/richData/styles/metadata/printerSettings/
customXml/media/sharedStrings…）は **1バイトも変更せず素通し** する。

## 2. アーキテクチャ

```
loadCDMTemplate (ASSETS fetch, 現行どおり)
  → unzipSync (fflate)                     … Map<path, Uint8Array>
  → 書込対象シートの xl/worksheets/sheetN.xml を SheetXmlPatcher で精密パッチ
  → xl/workbook.xml の <calcPr> に fullCalcOnLoad="1" を付与
  → xl/calcChain.xml を削除（rels と [Content_Types].xml からも除去。Excelが再構築する）
  → zipSync → NextResponse
```

- シート名→`sheetN.xml` の解決は `xl/workbook.xml`（`<sheet name= r:id=>`）と
  `xl/_rels/workbook.xml.rels` を解析して行う（番号ハードコード禁止）。
- 文字列セルは `t="inlineStr"` で書く（sharedStrings.xml 非接触）。XML エスケープ必須。
  ユーザー由来文字列（ニックネーム等）は常に inlineStr であり数式注入は構造上不可能。
- 既存セルの上書きは `s=`(style) 属性を保持。値クリアは `<v>`/`<is>` のみ除去し
  セル・数式・スタイルは残す。数式セルへの値書込は明示 API（縮退モード専用）でのみ許可。
- 依存追加: `fflate`。`@e965/xlsx` は**エクスポータからは完全に除去**したが、依存自体は残す:
  E2E ランナー（e2e/tc-all.js TC-816A）が生成済みワークブックの**読み取り側**検証に
  `XLSX.read` を使う（読みは安全。壊れていたのは write 側のみ）。

### モジュール構成（src/lib/cdm-export/）

```
types.ts              共有型（CellWrite ほか）※設計時に確定済み
cdm-constants.ts      コース表・シート名・座標定数 ※設計時に確定済み
xlsx-zip-patcher.ts   zip入出力・パート素通し・calcChain除去・calcPr付与・シート解決
sheet-xml-patcher.ts  sheetData の <row>/<c> 精密パッチ（挿入は行/セル順序維持）
time-format.ts        "M:SS.cc" ⇔ MSSHH整数（centisecond, 半上げ丸め）
fill/main-hub.ts      Main Hub 充填
fill/tt-qualifications.ts
fill/qualifications.ts  BM/MR/GP 共通（モードパラメタ化）
fill/finals.ts          BM/MR/GP 決勝 + slot-semantics
fill/tt-finals.ts       TT 決勝（ライフ再生 replay 含む）
index.ts              generateCdmWorkbook(templateBuffer, tournamentData) → Uint8Array
```

route.ts は CSV パスを温存し、CDM パスのみ `generateCdmWorkbook` を呼ぶ薄い層にする。

## 3. セル契約（fill map）

座標はすべてテンプレート実物のダンプから検証済み。**ここに書かれていないセルには一切書かない。**

### 3.1 Main Hub（Registration テーブル A1:L61）

| 列 | 内容 | 備考 |
|----|------|------|
| B,C | name, nickname | rows 2..61（最大60人、超過は切捨て+log） |
| D | country（プレーンテキスト） | 元はリッチバリュー画像。テキスト化で国旗表示は劣化（許容・後述） |
| E..H | TT/BM/MR/GP Order = **合成順序** | 下記 3.1.1 |
| I..L | "Yes"/"No"（モード参加） | TT=TTEntry(qualification)有無、他=Qualification有無 |
| O3..R3 | Qualifying 人数 | TT=**min(24, TT予選人数)**（O3 は TT Finals の名簿スピル長。replay のユニバースと一致必須。予選ゼロ時のみ distinct phase 選手数へフォールバック）、BM/MR/GP=ブラケット規模(24/16/8) |
| O4..R4 | グループ数 | TT=0、他=予選の distinct group 数 |

- A列（`=ROW()-1`）、N2:R2（COUNTIF）、T/U（集計スピル）は**非接触**。
- 余剰行（プレイヤー数+2 .. 61）は B..L の値をクリア。
- 行順は **name（B列）の大小無視昇順**（CDM 2025 実データと同じ。機能には無関係で
  FILTER/SORT が再導出する）。

#### 3.1.1 合成順序（重要）

シートは Main Hub の Order 値から
`グループg = {gi+1, gi+1+G, gi+1+2G, ...}`（G=グループ数, gi=0始まりグループ添字）という
**インターリーブでグループを導出**する。アプリのグループ割当（蛇行スネーク）とは異なるため、
アプリの実グループ構成を再現するよう Order を合成する:

```
グループ g(添字gi) 内でアプリ seeding 昇順 k番目(0始まり) の選手
  → Order = gi + 1 + k*G
```

これによりシート導出グループ == アプリ実グループとなる。TT はグループなしのため
seeding（なければ予選順位）をそのまま 1..N で振る。
制約: シート数式は均等グループ（P2/P4 が整数）を前提とする。不均等時は log 警告のうえ続行。

### 3.2 TT Qualifications

- 書込は **G..Z（20コース、`CDM_COURSES` 順）× rows 2..48** のタイムのみ。
- 行は `F2# = SORT(FILTER(Registration[Nickname], TT="Yes"))` のスピル順 =
  **ニックネームの大文字小文字無視・昇順**を JS 側で再現して割当てる
  （Excel SORT は case-insensitive・安定。非ASCII勢の照合差異は既知の限界として log）。
- タイム形式: `"M:SS.cc"` → 整数 `M*10000 + SS*100 + CC`（ms→centisecond は半上げ）。
- 欠測コースはセル値クリア（シート数式上 0 扱いになり、**全タイム入力完了までシート側
  TTポイントはアプリと一致しない**。テンプレート設計由来の既知の限界として文書化）。
- E,F（#・名前）、AA..CR（換算・ランク・ポイント・最終順位）は全て数式 → **非接触**。

### 3.3 BM/MR/GP Qualifications（共通レイアウト）

- 順位表 E..Q、ソート済み順位 AF..AI/AJ..AM/AG..AJ、出場順 AK..AL 等は全て数式 → **非接触**。
- 試合領域は **選手ブロック制**: データ行 2..16、ヘッダ行17、以降ストライド16（最大48ブロック）。
  ブロック順 = シートの G2# スピル順 = **グループA選手（合成Order昇順）→ B → C…**。
  各試合は**両選手のブロックに1行ずつ（計2回）**現れる。
- ブロック内行（オーナー視点・roundNumber, matchNumber 昇順）:

| 列 | 内容 |
|----|------|
| S | matchNumber |
| T | tvNumber（null はクリア） |
| U | オーナーの side（player1Side/player2Side） |
| V | オーナーのニックネーム |
| W | オーナーのスコア（BM/MR: ラウンド取得数 0..4、GP: ドライバーポイント 0..45） |
| Z | 相手ニックネーム（BYE は `Break`） |
| AA | 相手の side |
| Y | **GPのみ**相手ポイントを書く（BM/MR は `=4-W` 数式のため非接触） |
| AB..AE | **MRのみ** assignedCourses 略称4つ / **GPのみ** AB=cup名 |

- X(`-`)・AB..AD(BM)/AF..AH(MR)/AC..AE(GP) の W/T/L 判定数式は非接触。
- 未完了試合はスコアセルをクリア（数式が空欄を無害に処理する）。
- BYE: BM/MR は W=4（自動完了）、GP は実入力ポイント。
- 余剰行・余剰ブロックは入力セル（S,T,U,V,W,Z,AA + GP:Y + MR:AB..AE）をクリア。

### 3.4 BM/MR/GP Finals（24人 CDM レイアウト）

ブロック列: Barrage1=D(4), Barrage2=K(11), Top16=R(18), UBQ=Y(25), UBS=AF(32),
UBF=AM(39), GF1=AT(46), GF2=BA(53)。下段 LB は R/Y/AF/AM/AT/BA の rows 41..54。
ブロック内オフセット: +0=ラベル/試合番号, +1=シード#, +2=名前, +3=国旗, +4=スコア。

**B3:B26 = シードリスト（B-position 順のニックネーム）**:
- 24人（16+playoff）: B-pos 1..12 = 直行勢（upper seed `[1,2,…,9,11,13,15]` の順）、
  B-pos 13..24 = playoff seed 1..12（= 予選13..24位相当）。
- 16人: B-pos = upper seed 1..16。8人: 1..8。
- 各シードの実選手は決勝試合レコードと `generateBracketStructure`/`generatePlayoffStructure`
  の構造シードを matchNumber で突合して復元する（DB に seed 列は無い）。
- **モード差（実テンプレート検証・統合時に確定）**: BM/MR の B3:B26 は型付き共有文字列入力だが、
  **GP の B3 は配列スピル数式** `=XLOOKUP(ANCHORARRAY(A3),'GP Qualifications'!AL:AL,'GP Qualifications'!AM:AM)`
  （`ref="B3:B26"`）であり、B4:B26 はそのスピルセル。よって **GP では B3:B26 を一切書かない・クリアしない**
  （書けば B3 で数式上書き例外、B4:B26 で #SPILL!）。GP のシードリストは GP Qualifications シートから
  数式で導出される（型付きシードセル E5 等とスコアセルは GP でも従来どおり書く）。
  実装は `fill/finals.ts` の `seedListIsFormula(mode)` で分岐する。

**書込セル（faithful モード = 16+playoff）**:
- 型付きシードセルのみ書く:
  - playoff_r1[k]: E{row},E{row+1}（rows 5/13/21/29）
  - playoff_r2[k]: L{row} のみ（slot2 は `Winner of B1,k` 数式 → 非接触）
  - winners_r1: idx 0,2,4,6 は S{row} のみ（slot2 は `Winner of B2,k` 数式）、
    idx 1,3,5,7 は S{row},S{row+1}
- スコアは **同一性解決**で書く（3.4.1）。
- 名前列（F/M/T/AA/AH/AO/AV/BC）・進出数式・最終順位ブロック（BG/BH/BI）・
  "First to"・Arena ヘッダ・B32/B33 は非接触。
- TV 番号はテンプレートに該当セルが無いため**書かない**。
- GF reset 不要時はスコアをクリアするだけ（数式が空欄処理）。

#### 3.4.1 スロット意味論と同一性解決スコア

テンプレート数式が定めるスロット帰属（検証済み）:

| round[idx] | slot1 | slot2 |
|---|---|---|
| playoff_r1[k] | typed seed | typed seed |
| playoff_r2[k] | typed seed (bye) | winnerOf playoff_r1[k] |
| winners_r1[2k] | typed seed | winnerOf playoff_r2[k] |
| winners_r1[2k+1] | typed seed | typed seed |
| winners_qf[k] | winnerOf winners_r1[2k] | winnerOf winners_r1[2k+1] |
| winners_sf[k] | winnerOf winners_qf[2k] | winnerOf winners_qf[2k+1] |
| winners_final | winnerOf winners_sf[0] | winnerOf winners_sf[1] |
| losers_r1[k] | loserOf winners_r1[2k] | loserOf winners_r1[2k+1] |
| losers_r2[k] | loserOf winners_qf[3-k] | winnerOf losers_r1[k] |
| losers_r3[k] | winnerOf losers_r2[2k] | winnerOf losers_r2[2k+1] |
| losers_r4[k] | loserOf winners_sf[k] | winnerOf losers_r3[k] |
| losers_sf | winnerOf losers_r4[0] | winnerOf losers_r4[1] |
| losers_final | **loserOf winners_final** | winnerOf losers_sf |
| grand_final | winnerOf winners_final | winnerOf losers_final |
| grand_final_reset | winnerOf grand_final | loserOf grand_final |

アプリの p1/p2 とスロット順は **losers_final で反転**している（他は一致を検証済み）。
よってスコアは「スロット意味論を解決した期待選手の実スコア」を書く。
期待選手と実レコードが一致しない場合（手動運用等）は p1/p2 順にフォールバックし `logger.warn`。

**縮退モード**:
- 16人（playoff 無し）: winners_r1 idx0,2,4,6 の slot2（S/T セル）を**値で上書き**
  （数式除去）。Barrage ブロックの入力/数式セルを除去。
- 8人: winners_qf 以降へ同様にマップし、UBQ/LB 各スロットの**名前セルを解決済み値で上書き**。
  未使用ブロック（Barrage/Top16/losers_r1,r2 の余剰スロット/losers_r4 等）は値・数式とも除去。
  log で縮退を明示。

### 3.5 TT Finals

ラウンドブロック: r=1..40、入力ブロック先頭列 `1+13(r-1)`（A,N,AA,…）、
表示ブロック先頭列 `7+13(r-1)`（G,T,AG,…）。各ブロック rows 1..26（データ 3..26）。

- アプリの順序: phase1 ラウンド（roundNumber昇順）→ phase2 → phase3 を
  シート Round 1..40 に順番に割当（40 超過は切捨て+log）。
  SuddenDeath は**独立ラウンドとして挿入しない**: `submitSuddenDeathResults` が解決後の
  `eliminatedIds`/`livesReset` を親 `TTPhaseRound` に書き戻すため（finals-phase-manager.ts）、
  親ラウンドだけでライフ台帳が完結する。別行にすると二重計上になる（実装時に確定した仕様）。
- 行 = 選手。Round1 入力ブロックの行順 = B3# = **予選最終順位 1..24**（アプリの予選順位で再現）。
  Round r≥2 の行順 = `SORTBY(前ラウンド表示名, 前ラウンド残ライフ desc)`（安定ソート）を
  JS 側 replay で正確に再現する。
- 書込:
  - 表示ブロック行1: `Round {r} - {コース正式名}`
  - Round1 入力ブロック C3..C26 = 初期ライフ（全員 1）。E = タイム（MSSHH）、非走者は 0。
  - Round r≥2: Time 列（+4）に参加者タイム/非走者 0、Gain 列（+3）に
    ライフ増分（phase3 開始時 +2、リセット時の補充）。Left 列は数式 → 非接触。
  - 表示ブロック Lost 列（表示先頭+4）: そのラウンドでライフを失った選手の
    **ソート後表示行**に `1`。
- ライフ replay: `TTPhaseRound.results/eliminatedIds/livesReset` とフェーズ規則
  （phase1/2 はライフ1相当・各ラウンド最下位1名脱落、phase3 は初期3・残8/4/2でリセット）
  から各ラウンドの Lost/Gain/残ライフを純関数で再構築する。
- 最終順位ブロック（TA..TD）は数式 → **非接触**（Overall Ranking の TT Bonus がここを参照）。
- 既知の限界: 脱落済み選手の最終ブロック内序列はライフ同値のため概算となる
  （テンプレート設計由来。確定順位の正はアプリ側）。

### 3.6 書かないシート

**Overall Ranking / TT for Scoub / Parameters は完全に数式駆動のため一切書かない。**
旧実装の writeOverallRanking は削除し、prisma include から playerScores を外す。

## 4. データ取得

現行 `CDM_EXPORT_INCLUDE` から `playerScores` を除去。追加で必要なもの:
- 決勝シード復元のための finals/playoff 試合（既に bmMatches 等に含まれる）。
- TT finals: `ttPhaseRounds`（含まれる）+ SuddenDeath（必要なら追加 include）。

Qualifying 人数（O3..R3）: 決勝データがあればその規模（playoff有=24）、なければ
`min(24, 予選参加者数)`。グループ数（O4..R4）: 予選 distinct group 数。

## 5. テスト計画（t-wada TDD）

1. **sheet-xml-patcher**: 実テンプレート XML 断片をフィクスチャに、
   置換/挿入/クリア/属性保持/エスケープ/無操作時の同一性 をユニットテスト。
2. **fill 各モジュール**: 純関数 `appData → CellWrite[]` を、合成順序・MSSHH 変換・
   ブロック配置・スロット意味論・TT replay について網羅的にユニットテスト。
   24人/16人/8人/途中状態/BYE/未完了 のフィクスチャを用意。
3. **統合**: 実テンプレート（public/templates）に対し generate を実行し、
   (a) パッチ対象セルの XML 値、(b) **非対象パートのバイト同一性**、
   (c) tables/richData/metadata の存続 をアサート（旧実装に欠けていた回帰ガード）。
4. **route**: 認証 401/403、404、テンプレート 503、Content-Type/Disposition は現行テストを継承。
   CSV テストは無変更。
5. **E2E**: `e2e/tc-cdm-export.js` 新設 — Phase A データ投入後に
   `?format=cdm` をバイナリ取得 → fflate で解凍 → tables/richData の存在と
   Main Hub/スコアセルの値を検証。`tc-all.js` に登録し、`E2E_TEST_CASES.md` に TC を追記。
6. **手動検証**: 生成物を LibreOffice/Excel で開き #SPILL!/#NAME? が無いことを目視確認
   （リリース前必須・自動化対象外）。

## 6. 既知の限界（明示的に受け入れるもの）

- 国旗（リッチバリュー画像）: Country をテキスト化するため国旗列は表示劣化する。
  richData パート自体は素通しで保全（将来 vm 索引の再利用で復元可能）。
- TT 予選の途中状態はシート側ポイントが暫定値になる（空タイム=0 のテンプレート仕様）。
- シートの Score 丸め（INT）とアプリ（round）で最大1ポイントの表示差。
- 8人ブラケットは数式エッジ非互換のため値上書き縮退（Excel 上での再計算連動なし）。
- ニックネームは DB unique 制約があり、シートのニックネーム・キーの一意性前提と整合。
- GP 決勝のシードリスト（B3:B26）はエクスポータが書かず GP Qualifications シートの
  数式スピルから導出されるため、GP Qualifications（AL/AM 列）が未充填だと GP 決勝の
  シード名が空欄/#N/A になる。BM/MR は型付き入力なので影響しない。確定は §5.6 の
  LibreOffice 目視確認で担保する。
