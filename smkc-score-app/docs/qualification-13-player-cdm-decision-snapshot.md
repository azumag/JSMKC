# 13-player CDM decision snapshot

Issue #3054 の 13 名ケースについて、既存の raw fixture impact と BREAK slot 全探索結果を一つの読み取り専用データとして扱うための診断メモです。

`buildUnsupportedCdmFixtureCandidateDecision(playerCount)` は、既存の `analyzeUnsupportedCdmFixtureCandidate` と `optimizeUnsupportedCdmBreakPlacement` を統合します。現行 generator mapping、`qualificationScheduleMethod`、対戦生成、DB は変更しません。対応済み人数、raw fixture の次候補が存在しない人数、不正入力では `null` を返します。

13 名では、現行 generator と同じ「実選手を先頭 slot に詰める」規約を16-slot fixtureへ延長すると、BREAK slot は **14, 15, 16** になります。一方、公平性評価で選ばれる代表配置は **1, 5, 9** です。この差を `recommendedPlacementUsesLeadingPlayerConvention = false` として明示します。

この違いは、13名CDM対応が単なる「BREAK上限を2から3へ増やす」変更ではないことを示します。末尾3 slotをBREAKに固定した場合は最大3 Day連続の休みが発生しますが、BREAK slotを1, 5, 9へ置くと最大連続休みを1 Dayに抑え、全選手のBREAK間隔を最低4 Day確保できます。ただし、そのためには実seedとfixture slotの対応を現行の先頭詰め規約から変える必要があります。

公平性推奨 `[1, 5, 9]` を採用し、実seedの相対順序を維持したまま残りslotへ詰める場合、seed-to-slot対応は次のようになります。

| seed | fixture slot | shift |
| ---: | -----------: | ----: |
|    1 |            2 |    +1 |
|    2 |            3 |    +1 |
|    3 |            4 |    +1 |
|    4 |            6 |    +2 |
|    5 |            7 |    +2 |
|    6 |            8 |    +2 |
|    7 |           10 |    +3 |
|    8 |           11 |    +3 |
|    9 |           12 |    +3 |
|   10 |           13 |    +3 |
|   11 |           14 |    +3 |
|   12 |           15 |    +3 |
|   13 |           16 |    +3 |

つまり推奨配置では **13名全員のfixture slotが現行のseed番号から移動**し、最大shiftは **+3 slot** です。`recommendedPlayerSlotAssignments`、`remappedPlayerCount`、`maximumPlayerSlotShift` としてこの影響を機械可読に返します。これはシード順位を入れ替える意味ではなく、実seedの順序を維持しながら BREAK slot を途中へ挿入した結果として fixture slot 番号が後方へずれる、という意味です。

## 対戦スケジュールへの影響

公平性推奨配置が、現行の先頭詰め規約をそのまま16-slot fixtureへ拡張した場合と比べて Day と 1P/2P 配置をどれだけ動かすかも `recommendedPlacementScheduleImpact` で比較します。どちらも13名総当たりなので **78対戦のpair集合は同一**ですが、BREAK slot の位置が変わることで fixture 上の配置は大きく変化します。

- real matches: 78
- pair-set differences: 0
- 同じ Day に残る対戦: 6 / 78
- Day が変わる対戦: 72 / 78
- Day shift 合計: 314 Day
- 1対戦あたり最大 Day shift: 14 Day
- 1P/2P が反転する対戦: 34 / 78
- Day と 1P/2P の両方が完全に同じ対戦: 2 / 78

このため、公平性推奨 `[1, 5, 9]` は「休み方だけを改善して通常対戦順はほぼ維持する」変更ではありません。pair集合は維持されますが、**72/78対戦のDayが変わり、34/78対戦で1P/2Pも反転**します。Issue #3054 の「CDM方式」を対戦pair集合だけとみなすのか、Day順・1P/2Pまで既存fixture規約として固定するのかは、13名対応の実装前に明示的に決める必要があります。

## 同じ公平性score内での schedule churn 最小化

公平性の評価軸（最大連続BREAK、全選手の最小BREAK間隔、BREAK-only Dayの最小間隔）だけでは最良配置が **16通り** 同率になります。従来の `recommendedBreakSlotPositions = [1, 5, 9]` は、その16通りから辞書順最小を決定的代表値として選んだものです。つまり `[1, 5, 9]` だけが公平という意味ではありません。

`recommendedScoreBreakSlotPositions` で16通りすべてを返し、その中から現行の末尾BREAK `[14, 15, 16]` に対する schedule churn が最小のものを別途 `leastDisruptiveFairPlacement` として評価します。公平性scoreは一切弱めず、二次評価として pair集合差分、Day変更対戦数、Day shift合計、1P/2P反転数、最大Day shift、seed-to-slot remap量の順で比較します。

13名では **`[8, 12, 16]`** が最小churn候補になります。この配置も最大連続BREAK **1 Day**、全選手の最小BREAK間隔 **4 Day**、BREAK-only Day最小間隔 **4 Day** を満たします。一方、辞書順代表 `[1, 5, 9]` と比べると既存fixtureからの変更量をかなり抑えられます。

| 指標                   | 公平性代表 `[1,5,9]` | 最小churn公平配置 `[8,12,16]` |
| ---------------------- | -------------------: | ----------------------------: |
| Dayが変わる対戦        |              72 / 78 |                   **56 / 78** |
| Day shift合計          |              314 Day |                   **218 Day** |
| 1P/2Pが反転する対戦    |              34 / 78 |                   **27 / 78** |
| Day・1P/2Pとも完全一致 |               2 / 78 |                   **21 / 78** |
| remapされるseed        |              13 / 13 |                    **6 / 13** |
| 最大fixture-slot shift |                   +3 |                        **+2** |

`[8, 12, 16]` でも Day変更56件、side反転27件は残るため、Day順・side orientation の仕様判断自体は消えません。ただし「公平性を優先すると必然的に72件のDay変更・全seed remapが必要」というわけではなく、**同じ公平性scoreの範囲で既存fixtureへの変更量をかなり削減できる**ことが分かります。13名対応を実装する場合は、辞書順代表ではなくこの低churn候補を比較対象に含める価値があります。

## Machine-readable blocking decisions

数値を読むだけでなく、どの大会ルール判断が実装を止めているかを API 利用側で直接扱えるよう、`blockingDecisions` を返します。これは既存の差分から機械的に導出するだけで、どの選択肢を採用すべきかは決定しません。

13名候補では次の3件が返ります。

- `break-slot-placement`: 公平性推奨 BREAK は先頭詰め規約と一致しないため、fixture途中への BREAK 挿入と seed-to-slot remap を許容するか決める必要がある
- `day-order-fidelity`: 推奨配置で 72 / 78 対戦の Day が変わるため、raw fixture の Day 順を不変条件とするか決める必要がある
- `side-orientation-fidelity`: 推奨配置で 34 / 78 対戦の 1P/2P が反転するため、raw fixture の side orientation を不変条件とするか決める必要がある

`pair-set-fidelity` は、比較した2配置で実対戦pair集合が異なる場合だけ追加されます。現在の13名候補では pair-set differences が0なので返りません。これにより、管理診断APIの利用側は個々の数値を再解釈せず、未決定のルール軸を安定した識別子として提示できます。

管理者向け `GET /api/tournaments/:id/qualification-schedule` は `unsupportedCdmFixtureCandidateDecisions` を返します。現在の7〜21名policy matrixで該当するのは13名だけで、次の情報を同じレスポンスから確認できます。

- 現行規約の BREAK slot positions: 14, 15, 16
- 推奨 BREAK slot positions: 1, 5, 9
- 同じ公平性scoreの全 BREAK slot positions
- 同じ公平性score内の最小schedule-churn候補: 8, 12, 16
- 推奨配置での seed-to-fixture-slot 対応
- remap対象: 13 / 13 players
- 最大 fixture-slot shift: +3
- pair set / Day / 1P・2P の変更量
- 実装前に必要な `blockingDecisions`
- 現行規約での最大連続 BREAK: 3 Day
- 推奨配置で達成できる最大連続 BREAK: 1 Day
- 全選手を通した最小 BREAK 間隔: 4 Day
- 評価した配置: 560通り
- 同じ最良scoreの配置: 16通り
- 推奨配置の BREAK × BREAK Day: 4, 8, 12
- seedごとの推奨 BREAK Day

BREAK配置に関する主要な判断材料は管理者向け qualification schedule diagnostics panel にも表示します。APIレスポンスを直接読まなくても、現行規約と推奨配置の BREAK slot、最大連続BREAK、最小BREAK間隔、BREAK-only Day、全探索件数を大会管理画面から確認できます。pair集合・Day shift・1P/2P反転数、同率公平性候補と `leastDisruptiveFairPlacement`、`blockingDecisions` の詳細は `unsupportedCdmFixtureCandidateDecisions` で確認できます。どちらも読み取り専用で、候補配置を採用したり対戦を再生成したりする操作は行いません。

したがって、実装着手前に最低でも「CDMのseed-to-slot対応を固定するか」「休養配置の公平性を優先してBREAK slotを途中へ挿入してよいか」「Day順と1P/2P配置までCDM規約として固定するか」を大会ルールとして決める必要があります。本診断はその判断材料を一箇所へ集約するだけで、13名をCDM生成可能にはしません。
