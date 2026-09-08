# Circle / CDM qualification schedule comparison

Issue #3054 で残っている「CDM方式のどこまでをTTへ適用するか」という仕様判断を、実際の大会データを変更せず確認するための比較情報です。

管理者向け診断 API `GET /api/tournaments/:id/qualification-schedule` は `smallGroupCdmComparisons` を返します。対象は、現行 policy では legacy circle のままだが低レベルの RR 2025 CDM fixture が存在する 7〜12 名です。13 名は対応 fixture がないため比較対象に含めません。

比較は同じ seed 順の仮想選手 `P1..Pn` を circle / CDM の両方へ入力して作ります。保存済み大会設定、予選レコード、対戦表、結果は一切変更しません。

## Fields

| field | meaning |
| --- | --- |
| `playerCount` | 比較した実選手数 |
| `cdmFixtureCapacity` | 使用する RR 2025 fixture の容量 |
| `cdmBreakSlotCount` | fixture 容量との差を埋める BREAK slot 数 |
| `realMatchCount` | BREAK を除いた実対戦数 |
| `circleTotalDays` | circle 方式の総 Day 数 |
| `cdmTotalDays` | CDM fixture の総 Day 数 |
| `pairSetDifferenceCount` | circle と CDM で片方にしか存在しない実対戦カード数 |
| `pairDayChangedCount` | 同じ対戦カードだが Day が変わる件数 |
| `pairSideChangedCount` | 同じ対戦カードだが 1P / 2P が反転する件数 |
| `byeAssignmentChangedPlayerCount` | BREAK / BYE の Day 配置が変わる選手数 |

`pairSetDifferenceCount = 0` であれば、実選手同士の総当たり集合自体は同一です。そのうえで `pairDayChangedCount` や `pairSideChangedCount` が 0 より大きければ、「対戦相手の集合は同じだが順序や1P/2P配置は変わる」と判断できます。

奇数人数では circle / CDM の両方に BYE / BREAK が発生し得るため、`byeAssignmentChangedPlayerCount` も運営影響として確認します。偶数人数では通常 0 です。

## #3054 での判断への使い方

この比較は、Issue #3054 のうち次の論点を具体化します。

- CDM化で変えたいのが「対戦カード集合」なのか「Day順」なのか「1P/2P配置」まで含むのか
- 7 / 9 / 11 名で BREAK の割当変更を許容するか
- 7〜12 名を現行の circle から CDM fixture へ切り替える価値があるか

一方、既存 circle 大会まで移行するか、13 名をどう扱うか、仕様確定後に既存結果へ遡及適用するかは別の大会ルール判断です。この比較結果だけで自動変更は行いません。
