# Balanced-side CDM override plan

Issue #3054 では、7〜12名の legacy circle グループについて、RR 2025 CDM fixture の対戦カードと Day/BREAK 配置を維持しつつ、1P/2P の向きだけ現行 circle と同じ均衡配置へ置き換える案を検討しています。

`buildBalancedCdmSidePreviewSchedule(playerIds)` はこの hybrid を `RoundRobinSchedule` としてメモリ上に生成できます。今回追加した `buildBalancedCdmSideOverridePlan(playerIds)` は、その preview を固定 CDM fixture から作るために必要な 1P/2P 反転だけを、fixture 順の差分リストとして返します。

各 `BalancedCdmSideOverride` は次を持ちます。

- `day`: 固定 CDM fixture 上の Day
- `cdmPlayer1Id` / `cdmPlayer2Id`: 固定 fixture の 1P / 2P
- `balancedPlayer1Id` / `balancedPlayer2Id`: circle の均衡配置を採用した場合の 1P / 2P

返される entry は、実対戦カード集合が circle と CDM で一致している場合に限り作られます。対応 CDM fixture がない人数、または将来 pair set が一致しない fixture になった場合は `null` を返します。差分が不要なら空配列になります。

この helper は DB、保存済み大会、対戦表、結果を更新しません。現在の `qualificationScheduleMethod` や 13→14名の policy 境界も変更しません。目的は、#3054 で balanced-side hybrid を採用すると決まった場合に、必要な fixture-side override をコード上で一意に再現・検証できる状態にすることです。

回帰テストでは、7〜12名の全対応サイズについて override 件数が既存の `pairSideChangedCount` と一致し、override の影響選手数が `playerSideChangedCount` と一致することを確認します。また、各 override が固定 CDM fixture の 1P/2P を正確に反転し、materialized preview と同じ Day・向きになることも確認します。
