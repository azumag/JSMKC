# Qualification schedule policy matrix

Issue #3054 の仕様判断を、実際の大会データを変更せず確認するための読み取り専用ポリシーマトリクスです。

`buildQualificationSchedulePolicyMatrix(configuredMethod)` は、RR 2025 Start fixture と現行の `qualificationScheduleMethod` policy が交差する 7〜21 名を連続して評価します。管理者向け診断 API `GET /api/tournaments/:id/qualification-schedule` の `policyMatrix` と `/tournaments/:id/cdm-archive-reconcile` の `Policy matrix (7–21 players)` 表示は同じ関数を使うため、API と UI で境界条件を重複実装しません。

このマトリクスは現在の予選グループ構成とは独立しています。まだ 7 名・13 名・21 名などのグループが存在しない大会でも、現行 policy なら何が起きるかを事前に確認できます。大会設定、予選レコード、対戦表は変更しません。現行 generator mapping にない人数については、raw fixture 表に存在する次の大きな fixture 容量と、そこへ載せる場合に必要な BREAK slot 数も判断材料として返します。ただしこれは候補情報だけであり、その人数を生成可能へ変更するものではありません。

## CDM-first (`configuredMethod = cdm`)

| 選手数 | 現行実効方式 | CDM fixture | BREAK | 現行方式で生成可能 |
| -----: | ------------ | ----------: | ----: | ------------------ |
|      7 | circle       |           8 |     1 | yes                |
|      8 | circle       |           8 |     0 | yes                |
|      9 | circle       |          10 |     1 | yes                |
|     10 | circle       |          10 |     0 | yes                |
|     11 | circle       |          12 |     1 | yes                |
|     12 | circle       |          12 |     0 | yes                |
|     13 | circle       | unavailable |     - | yes                |
|     14 | CDM          |          16 |     2 | yes                |
|     15 | CDM          |          16 |     1 | yes                |
|     16 | CDM          |          16 |     0 | yes                |
|     17 | CDM          |          18 |     1 | yes                |
|     18 | CDM          |          18 |     0 | yes                |
|     19 | CDM          |          20 |     1 | yes                |
|     20 | CDM          |          20 |     0 | yes                |
|     21 | CDM          | unavailable |     - | no                 |

13 名以下を circle に保つ 13→14 境界は現行大会 policy であり、低レベルの fixture 可否そのものではありません。7〜12 名には CDM fixture が存在するため、#3054 で 13 名以下を CDM 化する場合は、BREAK を許容する人数と exact-fit の人数をこの表から切り分けられます。

13 名は現行 generator mapping には対応 fixture がありません。一方、raw fixture 表で次に大きいものは 16-slot fixture なので、13 名をそこへ載せる案は **3 BREAK slot** を必要とします。policy matrix はこの事実を `nearestLargerCdmFixtureCapacity = 16` / `nearestLargerCdmBreakSlotCount = 3` として読み取り専用で返しますが、`cdmFixtureCapacity` は引き続き `null` のままで、13 名を CDM 生成可能にはしません。現在の generator は BREAK slot を最大2つまで扱う実装なので、13 名対応は単純な policy 切替ではなく、3 BREAK を許容するかという大会ルールと生成実装の両方の判断が必要です。

21 名は現行 policy が CDM を要求する一方で対応 fixture がなく、生成は未対応として明示的に失敗します。raw fixture 表にも 21 名より大きい fixture はないため、nearest-larger candidate もありません。この挙動も仕様判断なしに circle へフォールバックさせません。

## Explicit circle (`configuredMethod = circle`)

明示的に circle が保存された大会は 7〜21 名すべてで `effectiveMethod = circle` のままです。CDM fixture 容量と BREAK 数はプレビュー情報として返りますが、方式を自動変更する意味ではありません。

## #3054 での使い方

仕様を決める際は、少なくとも次をこのマトリクスと実大会の `summary` / `modes` の両方で確認します。

- 7〜12 名の既存 fixture を TT に採用するか
- BREAK が必要な 7 / 9 / 11 / 14 / 15 / 17 / 19 名を同じ運用で扱うか
- fixture のない 13 名をどう扱うか。16-slot fixture + 3 BREAK を新たに許容するなら generator 側の対応拡張も必要
- 21 名以上を現行どおり未対応として止めるか
- 明示的な circle 大会を移行対象に含めるか

マトリクスは policy と fixture の「可能性」を示し、実大会の `summary` / `modes` は「現在どれだけ影響があるか」を示します。どちらも読み取り専用で、#3054 の大会ルール確定前に挙動を変更しないための診断情報です。

### 7〜12 名の 1P/2P 偏り

管理 UI の `Circle → CDM impact (7–12 players)` は、同じシード順で circle と CDM fixture を生成して 1P/2P 配置の差も比較します。`Max 1P/2P imbalance` に加えて、各選手が総当たりで必ず持つ理論上の最小偏り（奇数人数は 0、偶数人数は 1）を超える選手数を `Players above minimum 1P/2P imbalance` として表示します。

人数別の比較結果は次のとおりです。

- 7名: 最大偏り circle 0 → CDM 4、最小超過選手 circle 0名 → CDM 5名
- 8名: 最大偏り circle 1 → CDM 3、最小超過選手 circle 0名 → CDM 4名
- 9名: 最大偏り circle 0 → CDM 4、最小超過選手 circle 0名 → CDM 8名
- 10名: 最大偏り circle 1 → CDM 5、最小超過選手 circle 0名 → CDM 7名
- 11名: 最大偏り circle 0 → CDM 6、最小超過選手 circle 0名 → CDM 9名
- 12名: 最大偏り circle 1 → CDM 5、最小超過選手 circle 0名 → CDM 7名

circle は既存の side-balance 最適化により全対象人数で理論上の最小偏りに収まります。一方、RR 2025 の固定 CDM fixture を 1P/2P 向きまでそのまま採用すると、7〜12 名では 4〜9 名の選手が最小偏りを超えます。このため #3054 の「CDM方式」を、対戦カード・Day順だけ合わせるのか、1P/2P 向きまで完全一致させるのかは公平性に直接影響する仕様判断として扱います。
