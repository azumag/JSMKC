# Circle / CDM qualification schedule comparison

Issue #3054 で残っている「CDM方式のどこまでをTTへ適用するか」という仕様判断を、実際の大会データを変更せず確認するための比較情報です。

管理者向け診断 API `GET /api/tournaments/:id/qualification-schedule` は `smallGroupCdmComparisons` を返します。対象は、現行 policy では legacy circle のままだが低レベルの RR 2025 CDM fixture が存在する 7〜12 名です。13 名は対応 fixture がないため比較対象に含めません。

同じ情報は `/tournaments/:id/cdm-archive-reconcile` の `Circle → CDM impact (7–12 players)` にも表示します。API と管理 UI は同じ `buildLegacyCircleCdmScheduleComparisons()` を使うため、比較ロジックを重複実装しません。

比較は同じ seed 順の仮想選手 `P1..Pn` を circle / CDM の両方へ入力して作ります。保存済み大会設定、予選レコード、対戦表、結果は一切変更しません。

## Fields

- `playerCount`: 比較した実選手数
- `cdmFixtureCapacity`: 使用する RR 2025 fixture の容量
- `cdmBreakSlotCount`: fixture 容量との差を埋める BREAK slot 数
- `realMatchCount`: BREAK を除いた実対戦数
- `circleTotalDays`: circle 方式の総 Day 数
- `cdmTotalDays`: CDM fixture の総 Day 数
- `circleMaxSideImbalance`: circle 方式で、各選手の `|1P回数 - 2P回数|` の最大値
- `cdmMaxSideImbalance`: CDM fixture で、各選手の `|1P回数 - 2P回数|` の最大値
- `pairSetDifferenceCount`: circle と CDM で片方にしか存在しない実対戦カード数
- `pairDayChangedCount`: 同じ対戦カードだが Day が変わる件数
- `totalPairDayShift`: 両方式に存在する実対戦について `|circle Day - CDM Day|` を合計した値
- `maxPairDayShift`: 1つの実対戦が移動する Day 数の最大値
- `playerDayChangedCount`: 少なくとも1試合の Day が変わる選手数
- `pairSideChangedCount`: 同じ対戦カードだが 1P / 2P が反転する件数
- `playerSideChangedCount`: 少なくとも1試合の 1P / 2P が反転する選手数
- `balancedCdmSidePlanAvailable`: CDM の対戦カード集合・Day順を保ちつつ circle の 1P / 2P 向きを再利用できるか
- `balancedCdmSideOverridePairCount`: balanced-side CDM にするため、固定 CDM fixture から向きを反転させる実対戦数
- `balancedCdmSideOverridePlayerCount`: balanced-side CDM によって少なくとも1試合の向きが変わる選手数
- `balancedCdmMaxSideImbalance`: balanced-side CDM での最大 `|1P回数 - 2P回数|`
- `balancedCdmExcessSideImbalancePlayerCount`: balanced-side CDM で理論上の最小偏りを超える選手数
- `byeAssignmentChangedPlayerCount`: BREAK / BYE の Day 配置が変わる選手数

`pairSetDifferenceCount = 0` であれば、実選手同士の総当たり集合自体は同一です。そのうえで `pairDayChangedCount` や `pairSideChangedCount` が 0 より大きければ、「対戦相手の集合は同じだが順序や1P/2P配置は変わる」と判断できます。`playerDayChangedCount` と `playerSideChangedCount` は同じ差分を選手単位に集約し、移行によって実際に何人の進行順・1P/2P配置が影響を受けるかを確認するために使います。

`pairDayChangedCount` だけでは、Day が変わるカードが「隣の Day へ少し動く」のか「大会進行上かなり離れた Day へ動く」のかを区別できません。そこで `totalPairDayShift` と `maxPairDayShift` も保持します。現行 fixture の 7〜12 名では、`pairDayChangedCount / totalPairDayShift / maxPairDayShift` はそれぞれ `9 / 22 / 5`, `15 / 36 / 5`, `18 / 50 / 7`, `25 / 74 / 7`, `38 / 132 / 8`, `47 / 174 / 8` です。CDM化は総 Day 数を増やしませんが、人数が大きいほど対戦順の並べ替え量は無視できないことが分かります。

現行の 7〜12 名 fixture では `circleTotalDays` と `cdmTotalDays` がすべて一致します。管理 UI でも `Schedule days: circle X → CDM X` と表示するため、小規模グループを CDM 化しても総 Day 数は増えず、影響は主に対戦 Day・1P/2P配置・BREAK割当にあることを確認できます。この性質は回帰テストで固定しています。

一方、1P / 2P の均衡は方式間で明確に異なります。circle 方式は side-balance optimization を行うため、7 / 9 / 11 名では最大差 0、8 / 10 / 12 名では最大差 1 です。現行 RR 2025 CDM fixture の最大差はそれぞれ 4 / 3 / 4 / 5 / 6 / 5 です。管理 UI の `Max 1P/2P imbalance: circle X → CDM Y` でこの差を確認できます。

7〜12 名では `pairSetDifferenceCount = 0` なので、CDM の対戦カード集合と Day 順を維持したまま、各実対戦の 1P / 2P 向きだけを circle 側と同じにする hybrid が構成できます。Day は side balance の集計に影響しないため、この hybrid の最大偏りと最小偏り超過人数は circle と同じになります。管理 UI の `Balanced-side CDM` は、その hybrid が構成可能か、固定 CDM fixture から何対戦・何選手分の side override が必要かを読み取り専用で示します。

これは fixture の良否を自動判定するものではありません。CDM fixture の 1P / 2P 向きをそのまま再現することを仕様とするなら、この偏りも fixture fidelity の一部です。逆に TT 側で1P / 2Pの均衡を維持したい場合、CDMの対戦カード・Day順だけを採用して side assignment は circle と同じ向きへ置換する設計が可能です。ただし、その場合は「CDMと完全一致」ではなくなるため #3054 で明示的な仕様判断が必要です。

奇数人数では circle / CDM の両方に BYE / BREAK が発生し得るため、`byeAssignmentChangedPlayerCount` も運営影響として確認します。偶数人数では通常 0 です。

## #3054 での判断への使い方

この比較は、Issue #3054 のうち次の論点を具体化します。

- CDM化で変えたいのが「対戦カード集合」なのか「Day順」なのか「1P/2P配置」まで含むのか
- Day順の変更が何カード・何選手へ波及するかだけでなく、各カードが何 Day 分移動するか
- 1P / 2P の fixture fidelity と、現行 circle の side balance のどちらを優先するか
- CDM の Day 順を維持しつつ side balance を circle 相当に保つ hybrid を仕様として許容するか
- 7 / 9 / 11 名で BREAK の割当変更を許容するか
- 7〜12 名を現行の circle から CDM fixture へ切り替える価値があるか

一方、既存 circle 大会まで移行するか、13 名をどう扱うか、仕様確定後に既存結果へ遡及適用するかは別の大会ルール判断です。この比較結果だけで自動変更は行いません。
