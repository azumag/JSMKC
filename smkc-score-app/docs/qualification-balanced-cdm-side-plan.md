# Balanced-side CDM override plan

Issue #3054 では、7〜12名の legacy circle グループについて、RR 2025 CDM fixture の対戦カードと Day/BREAK 配置を維持しつつ、1P/2P の向きだけ現行 circle と同じ均衡配置へ置き換える案を検討しています。

`buildBalancedCdmSidePreviewSchedule(playerIds)` はこの hybrid を `RoundRobinSchedule` としてメモリ上に生成できます。`buildBalancedCdmSideOverridePlan(playerIds)` は、その preview を固定 CDM fixture から作るために必要な 1P/2P 反転だけを、fixture 順の差分リストとして返します。

各 `BalancedCdmSideOverride` は次を持ちます。

- `day`: 固定 CDM fixture 上の Day
- `cdmPlayer1Id` / `cdmPlayer2Id`: 固定 fixture の 1P / 2P
- `balancedPlayer1Id` / `balancedPlayer2Id`: circle の均衡配置を採用した場合の 1P / 2P

返される entry は、実対戦カード集合が circle と CDM で一致している場合に限り作られます。対応 CDM fixture がない人数、または将来 pair set が一致しない fixture になった場合は `null` を返します。差分が不要なら空配列になります。

## Seed-position projection

`buildBalancedCdmSideSeedOverridePlan(playerCount)` は、同じ override plan を実プレイヤーIDではなく seed position で返す read-only helper です。#3054 の仕様レビューでは「どの seed 同士の試合を、どの Day で反転する必要があるか」を大会データに依存せず確認できます。

各 `BalancedCdmSideSeedOverride` は次を持ちます。

- `day`: 固定 CDM fixture 上の Day
- `cdmPlayer1Seed` / `cdmPlayer2Seed`: 固定 fixture の 1P / 2P seed
- `balancedPlayer1Seed` / `balancedPlayer2Seed`: balanced-side hybrid での 1P / 2P seed

7〜12名の legacy-circle 比較では、seed plan の件数は `balancedCdmSideOverridePairCount` と一致し、影響 seed 数は `balancedCdmSideOverridePlayerCount` と一致します。各 entry は 1P/2P を純粋に反転するため、`balancedPlayer1Seed === cdmPlayer2Seed` かつ `balancedPlayer2Seed === cdmPlayer1Seed` です。13名のように対応 CDM fixture がない人数や、不正な人数入力では `null` を返します。

## Preview invariant validation

`validateBalancedCdmSidePreviewSchedule(playerIds)` は、materialized preview が hybrid の前提を満たしているかを読み取り専用で検証します。対応 fixture がなく preview 自体を作れない場合は `null` を返します。

検証する invariant は次の5点です。

- CDM と `totalDays` が一致する
- CDM と実対戦 pair set が一致する
- 各実対戦の Day が CDM と一致する
- BYE/BREAK match の Day と参加者が CDM と一致する
- 各実対戦の 1P/2P 向きが circle と一致する

戻り値は各 check の真偽、`valid`、失敗した invariant code を保持します。現在の 7〜12名 fixture では全 check が成功することを回帰テストで固定しています。将来 #3054 を実際の書き込み経路へ接続する場合も、この検証を事前条件として使うことで、fixture 更新や schedule generator の変更による silent drift を検出できます。

この validator も大会設定・対戦表・DB・保存済み結果には触れません。

## Diagnostics UI

管理用の qualification schedule diagnostics では、7〜12名それぞれの balanced-side hybrid について seed override plan を折りたたみ表示します。表示は `D{day}: {seed1}↔{seed2}` 形式で、固定 CDM fixture のどの試合で 1P/2P を反転する必要があるかを、実プレイヤー情報に依存せず確認できます。既存の集計値だけでなく、レビュー時に具体的な Day / seed の組み合わせまで追えることが目的です。

この表示も read-only であり、DB、保存済み大会、対戦表、結果、`qualificationScheduleMethod`、13→14名の policy 境界は変更しません。

この helper も DB、保存済み大会、対戦表、結果を更新しません。現在の `qualificationScheduleMethod` や 13→14名の policy 境界も変更しません。目的は、#3054 で balanced-side hybrid を採用すると決まった場合に、必要な fixture-side override をコード上で一意に再現・検証し、seed position 単位でレビューできる状態にすることです。

回帰テストでは、7〜12名の全対応サイズについて override 件数が既存の `pairSideChangedCount` と一致し、override の影響選手数が `playerSideChangedCount` と一致することを確認します。また、各 override が固定 CDM fixture の 1P/2P を正確に反転し、materialized preview と同じ Day・向きになること、seed projection が同じ件数・影響 seed 数を保持することも確認します。UI テストでは、診断パネルに override 件数と少なくとも1件の Day / seed 反転表示が出ることを確認します。
