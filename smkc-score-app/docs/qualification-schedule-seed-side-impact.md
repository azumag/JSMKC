# Seed-level CDM 1P / 2P impact

Issue #3054 の判断材料として、RR 2025 CDM fixture の固定 1P / 2P 向きをそのまま採用したとき、理論上避けられない最小偏りを超える seed position を記録する。

この情報は `buildLegacyCircleCdmScheduleComparisons()` の `cdmExcessSideImbalanceSeedPositions` から取得できる。比較は同じ seed 順の仮想選手 `P1..Pn` を使う読み取り専用診断であり、大会設定・対戦表・結果・保存済みデータは変更しない。

## 現行 fixture の結果

| Players | Minimum unavoidable `|1P-2P|` | CDM max | Affected seeds |
| ---: | ---: | ---: | --- |
| 7 | 0 | 4 | 2, 3, 4, 5, 7 |
| 8 | 1 | 3 | 2, 3, 4, 7 |
| 9 | 0 | 4 | 1, 2, 3, 4, 6, 7, 8, 9 |
| 10 | 1 | 5 | 1, 2, 3, 6, 7, 8, 9 |
| 11 | 0 | 6 | 2, 3, 4, 5, 6, 7, 8, 9, 11 |
| 12 | 1 | 5 | 2, 3, 5, 6, 8, 11, 12 |

既存の `cdmExcessSideImbalancePlayerCount` は影響人数だけを示していたが、この seed 一覧により偏りが特定 seed に集中しているかを確認できる。seed position がランキングや配置順と意味的に結び付く運用では、単なる人数だけでなく「どの seed が固定 CDM orientation の影響を受けるか」も仕様判断時に確認する必要がある。

7〜12 名では既存の balanced-side CDM preview が構成可能で、CDM の Day / BREAK 配置を維持しながら circle 側の 1P / 2P 向きを再利用できる。その hybrid では最小偏り超過人数は 0 に戻るため、#3054 では次のいずれを優先するかを明示的に決める必要がある。

- RR 2025 fixture の 1P / 2P 向きまで完全一致させる
- CDM の対戦カード・Day・BREAK を採用しつつ、1P / 2P は balanced-side hybrid とする

この文書と診断値は判断材料だけを追加するもので、どちらの方針も自動選択しない。
