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

現行 `generateRoundRobinSchedule(..., { method: 'cdm' })` は BREAK slot を最大2つまで用意し、13名には明示的に `UnsupportedRoundRobinPlayerCountError` を返します。この文書と helper はその制約を解除しません。13名を実際に CDM 化するには、少なくとも次を仕様として決める必要があります。

- 1選手あたり3回の休みをTT運用として許容するか
- 1 Day に最大3名が休む進行を許容するか
- 3 Day連続の休みが一部seedに生じる配置を許容するか
- BREAK-BREAK 行を保存対象として正規化するか、生成段階で除外するか
- generator の BREAK slot 上限と13名 mappingをどう拡張するか

これらは大会ルールに関わるため、本 helper は判断材料の生成だけを行い、`qualificationScheduleMethod`、fixture mapping、対戦生成、DB、既存大会・結果には触れません。
