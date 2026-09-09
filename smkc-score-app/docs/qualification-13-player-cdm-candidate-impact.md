# 13-player CDM raw fixture candidate impact

Issue #3054 の 13 名ケースについて、現行 generator mapping を変更せず、raw RR 2025 fixture を使った場合の運用負荷だけを読み取り専用で数値化します。

`analyzeUnsupportedCdmFixtureCandidate(playerCount)` は、現行 CDM generator が未対応の人数について、raw fixture 表から次に大きい fixture を探し、実選手を先頭 slot、残りを BREAK slot とみなして fixture 全体を分類します。既に generator 対応済みの人数、raw fixture が尽きる人数、不正な入力では `null` を返します。

## 13 名を 16-slot fixture に載せる場合

現行 raw fixture で次に大きい候補は 16-slot なので、13 名では 3 BREAK slot が必要です。fixture 全15 Dayを展開すると次の結果になります。

- 実対戦: 78件（13C2）
- 実選手 × BREAK: 39件
- BREAK × BREAK: 3件
- BREAK × BREAK が発生する Day: 13, 14, 15
- 各選手の BREAK: 最小3回 / 最大3回
- 1選手あたりの連続 BREAK: 最大3 Day
- 3 Day 連続 BREAK になる seed: 1, 4, 5, 8, 9, 12, 13
- 1 Day あたり休む実選手: 最小1名 / 最大3名
- fixture 上の総pair行: 120件（16C2 = 78 + 39 + 3）

つまり「3 BREAK slot」は大会全体で3回だけ休みが入るという意味ではなく、各実選手が3回ずつ休み、合計39件の player-BREAK 行が発生する構成です。また3つの BREAK slot 同士の総当たりにより、3件の BREAK-BREAK 行も発生します。

休みは均等な回数でも Day 上では分散していません。13名候補では7つの seed position が3 Day連続で休みになり、BREAK-BREAK 行も最後の3 Dayに集中します。CDM fixture の slot 順をそのまま seed 順として採用する場合、この偏りをTTの運用上許容するかは別途判断が必要です。

## BREAK slot の置き場所を変えた場合

`optimizeUnsupportedCdmBreakPlacement(playerCount)` は、production mapping を変更せずに、raw fixture 内で BREAK slot をどこに置くかだけを全探索します。13名 / 16-slot では `16C3 = 560` 通りを評価します。

評価順は次の通りです。

1. 全選手の「最大連続 BREAK Day 数」を最小化する
2. その中で、各選手の BREAK Day 間隔のうち最も狭いものをできるだけ広げる
3. その中で、BREAK × BREAK が発生する Day 同士の最小間隔を最大化する
4. 同点なら 1-based の BREAK slot position が辞書順で最小のものを代表例にする

13名では、最大連続 BREAK を **3 Day → 1 Day** まで下げられます。560通り中208通りが「全選手で連続 BREAK なし」を達成します。その208通りをさらに比較すると、**全選手について各 BREAK の間隔を最低4 Day確保できる配置は16通り**です。この16通りでは BREAK × BREAK Day の最小間隔も最大値4 Dayを達成します。決定的な代表例は次です。

- BREAK slot positions: **1, 5, 9**
- BREAK × BREAK Day: **4, 8, 12**
- 最大連続 BREAK: **1 Day**
- 全選手を通した最小 BREAK 間隔: **4 Day**
- seedごとの BREAK Day:
  - 1: 7, 11, 15
  - 2: 6, 10, 14
  - 3: 5, 9, 13
  - 4: 3, 11, 15
  - 5: 2, 10, 14
  - 6: 1, 9, 13
  - 7: 3, 7, 15
  - 8: 2, 6, 14
  - 9: 1, 5, 13
  - 10: 4, 8, 12
  - 11: 3, 7, 11
  - 12: 2, 6, 10
  - 13: 1, 5, 9

この結果は、先頭13 slotへ実選手を詰める現在の仮定で見える「3 Day連続BREAK」が16-slot fixtureそのものの不可避な性質ではなく、**BREAK slotを末尾3枠へ固定する配置の性質**であることを示します。さらに、単に連続休みを消せるだけでなく、BREAKを全選手について最低4 Dayずつ離せる配置まで絞り込めます。

一方で BREAK slot を途中へ挿入すると、実seedが割り当てられるfixture slotも変わります。したがって「CDM方式」がseed-to-slot対応まで固定することを意味するなら、この最適化は採用できません。逆に、fixtureを維持しつつ休養配置の公平性を優先してslot割当を調整してよいなら、13名対応時の候補になります。これは #3054 の「シード位置・Day順・1P/2P配置まで完全一致させるか」という仕様判断に直接関係します。

現行 `generateRoundRobinSchedule(..., { method: 'cdm' })` は BREAK slot を最大2つまで用意し、13名には明示的に `UnsupportedRoundRobinPlayerCountError` を返します。この文書と helper はその制約を解除しません。13名を実際に CDM 化するには、少なくとも次を仕様として決める必要があります。

- 1選手あたり3回の休みをTT運用として許容するか
- 1 Day に最大3名が休む進行を許容するか
- CDM seed-to-slot対応を固定するか、BREAK slot位置を調整して連続休みを避けてよいか
- BREAK-BREAK 行を保存対象として正規化するか、生成段階で除外するか
- generator の BREAK slot 上限と13名 mappingをどう拡張するか

これらは大会ルールに関わるため、本 helper は判断材料の生成だけを行い、`qualificationScheduleMethod`、fixture mapping、対戦生成、DB、既存大会・結果には触れません。
