# 13-player CDM admin evidence

Issue #3054 の13名CDM候補について、管理者向け qualification schedule diagnostics panel で確認できる読み取り専用の判断材料をまとめます。詳細な算出根拠は `qualification-13-player-cdm-decision-snapshot.md` を参照してください。

## 表示する候補

現行の先頭詰め規約では BREAK slot は `[14, 15, 16]` です。公平性scoreの決定的代表値は `[1, 5, 9]` ですが、同じ最良公平性scoreの16候補のうち既存fixtureからの変更量が最小なのは `[8, 12, 16]` です。

管理画面では、APIを直接読まなくても次の比較を確認できます。

- 公平性代表 `[1, 5, 9]`: 72 / 78 対戦でDay変更、Day shift合計314、1P/2P反転34、13 / 13 seedをremap
- 最小churn公平配置 `[8, 12, 16]`: 56 / 78 対戦でDay変更、Day shift合計218、1P/2P反転27、6 / 13 seedをremap、最大fixture-slot shift +2
- 最小churn公平配置で実際にremapされるseed: `8→9 (+1)`, `9→10 (+1)`, `10→11 (+1)`, `11→13 (+2)`, `12→14 (+2)`, `13→15 (+2)`。seed 1〜7 は現行slot位置のまま
- 未解決の判断軸: `break-slot-placement`, `day-order-fidelity`, `side-orientation-fidelity`

seed remap の詳細は通常表示を圧迫しないよう折りたたみ表示にしています。候補を採用した場合に、どのseedがfixture上のどのslotへ動くかを管理画面上で直接確認できます。

この表示は候補間のトレードオフを管理者が確認するためのものです。`qualificationScheduleMethod`、generator mapping、実際のBREAK配置、保存済み大会、対戦、結果は変更しません。13名CDMは引き続きunsupportedであり、画面から候補を採用したり対戦を再生成したりする操作も行いません。
