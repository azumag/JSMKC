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

管理者向け `GET /api/tournaments/:id/qualification-schedule` は `unsupportedCdmFixtureCandidateDecisions` を返します。現在の7〜21名policy matrixで該当するのは13名だけで、次の情報を同じレスポンスから確認できます。

- 現行規約の BREAK slot positions: 14, 15, 16
- 推奨 BREAK slot positions: 1, 5, 9
- 推奨配置での seed-to-fixture-slot 対応
- remap対象: 13 / 13 players
- 最大 fixture-slot shift: +3
- 現行規約での最大連続 BREAK: 3 Day
- 推奨配置で達成できる最大連続 BREAK: 1 Day
- 全選手を通した最小 BREAK 間隔: 4 Day
- 評価した配置: 560通り
- 同じ最良scoreの配置: 16通り
- 推奨配置の BREAK × BREAK Day: 4, 8, 12
- seedごとの推奨 BREAK Day

同じ判断材料は管理者向け qualification schedule diagnostics panel にも表示します。APIレスポンスを直接読む必要なく、現行規約と推奨配置の BREAK slot、最大連続BREAK、最小BREAK間隔、BREAK-only Day、全探索件数を大会管理画面から確認できます。表示は読み取り専用で、候補配置を採用したり対戦を再生成したりする操作は行いません。

したがって、実装着手前に最低でも「CDMのseed-to-slot対応を固定するか」「休養配置の公平性を優先してBREAK slotを途中へ挿入してよいか」を大会ルールとして決める必要があります。本診断はその判断材料を一箇所へ集約するだけで、13名をCDM生成可能にはしません。
