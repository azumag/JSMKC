# 予選グループの対戦表方式

Issue #3054 の仕様検討で、既存実装と「TTでもCDM方式を使う」という要望を混同しないための現状整理です。

## 現在の実装

大会には `qualificationScheduleMethod` が保存されます。新規大会は `cdm` として作成されますが、実際に各グループへ適用する方式は `resolveQualificationScheduleMethodForGroup` が人数ごとに決定します。

- 保存された方針が `circle`: 人数によらずcircle
- 保存された方針が `cdm` かつ13名以下: circle
- 保存された方針が `cdm` かつ14〜20名: CDM fixture
- 保存された方針が `cdm` かつ21名以上: CDMを要求し、round-robin生成時に未対応人数として明示エラー

このため、新規大会が `cdm` 方針であっても、13名以下のグループは現在も従来のcircle methodです。

`getQualificationSchedulePolicyDecision` はこの判定を `configuredMethod` / `playerCount` / `effectiveMethod` / `reason` / `generationSupported` として返します。現在の13→14境界を診断・テスト・将来の管理UIで再実装せず参照できるようにするための読み取り専用情報で、対戦表の生成結果自体は変更しません。

加えて、同じ判定結果には `cdmFixtureCapacity` / `cdmBreakSlotCount` を含めます。これは「現在そのグループがCDMを実効方式として使うか」とは独立した読み取り専用情報で、仮にCDMへ切り替えた場合に利用可能なfixture容量と必要なBREAK slot数を示します。fixture未対応人数では両方とも `null` です。fixture選択ロジックは `getCdmRoundRobinFixturePlan` に集約され、実際のround-robin生成と診断表示が同じ対応表を参照します。

現在の `reason` は次の3種類です。

- `configured-circle`: 大会設定自体がcircle
- `cdm-small-group-legacy-circle`: CDM-first大会だが13名以下なので現行policyによりcircle
- `cdm-requested`: 14名以上なのでCDM生成を要求する。21名以上などfixture未対応人数は後段で明示エラー

一方、低レベルの `generateRoundRobinSchedule(..., { method: 'cdm' })` 自体は RR 2025 Start の fixture に合わせて 7〜12名にも対応しています。つまり「fixtureが存在する人数」と「大会運用上CDMを選択する人数」は同じではありません。この差は意図的なpolicy境界として扱い、Issue #3054 の仕様決定なしに変更しません。

## 管理者向け診断API / UI

`GET /api/tournaments/:id/qualification-schedule` は管理者専用の読み取りAPIです。保存された `qualificationScheduleMethod` と、BM / MR / GP の現在の予選グループ人数から、各グループの実効方式を返します。

レスポンスの各グループには次が含まれます。

- `group`: グループ名
- `configuredMethod`: 大会に保存されている方式
- `playerCount`: 現在の予選レコード数
- `effectiveMethod`: 現行policyで実際に選ばれる方式
- `reason`: 判定理由
- `cdmFixtureCapacity`: 現在の人数を収容できるCDM fixture容量。未対応なら `null`
- `cdmBreakSlotCount`: そのfixtureで必要なBREAK slot数。未対応なら `null`
- `generationSupported`: 現在の `effectiveMethod` で対戦表を生成可能か。circleは `true`、CDMは対応fixtureがある場合のみ `true`

このAPIは大会設定・予選レコード・対戦表を変更しません。#3054 の仕様確定前でも、実大会が13→14境界のどちら側にいるかを運営・デバッグ時に確認できます。

同じ情報は管理者用の `/tournaments/:id/cdm-archive-reconcile` 画面にも読み取り専用で表示されます。BM / MR / GP ごとに各グループの人数、保存された方式（Configured）、実際に適用される方式（Effective）、判定理由に加え、CDMへ切り替えた場合のfixture容量とBREAK slot数を確認できます。現在の実効方式がCDMなのに対応fixtureがない場合は、対戦表生成がサポートされていない状態として警告も表示します。とくに `Configured: CDM · Effective: CIRCLE` のような表示により、13名以下のCDM-first大会が現在の互換policyでcircleへ解決されていることを設定変更と取り違えず確認できます。表示によって大会設定や対戦表が変更されることはありません。

CDM fixture preview の対応は現在次の通りです。

- 7→8（BREAK 1）、8→8（BREAK 0）
- 9→10（BREAK 1）、10→10（BREAK 0）
- 11→12（BREAK 1）、12→12（BREAK 0）
- 14→16（BREAK 2）、15→16（BREAK 1）、16→16（BREAK 0）
- 17→18（BREAK 1）、18→18（BREAK 0）
- 19→20（BREAK 1）、20→20（BREAK 0）
- 13および21以上など: fixture未対応

## CDM fixture と circle method の違い

### circle method

- 参加者配列から総当たりを動的生成する。
- 奇数人数ではBREAKを1枠追加する。
- 生成後に1P/2Pの偏りを最小化する。
- 人数に対して柔軟で、既存の `circle` 大会の互換方式でもある。

### CDM fixture

- `cdm-round-robin-fixtures.ts` の固定表を使用する。
- RR 2025 Start のシード位置、Day、対戦カード順を再現する。
- fixture容量より実選手が少ない場合はBREAK slotで埋める。
- 対応外の人数を暗黙にcircleへ切り替えず、必要な場合は明示エラーにする。

## Issue #3054 で残っている仕様判断

「TTグループステージをCDM方式にする」を実装する前に、少なくとも次を明示する必要があります。

1. 13名以下のTTグループも、利用可能な7/8/10/12人fixtureへ切り替えるのか。
2. 「CDM方式」とは固定の対戦カード順だけを指すのか、それともシード位置・Day順・1P/2P配置まで完全一致させるのか。
3. 既存の `circle` 大会を変更するのか、新規セットアップだけを対象にするのか。
4. fixture容量と実人数が異なる場合（7→8、9→10、11→12、14/15→16、17→18、19→20）のBREAK配置をTTでもそのまま採用するのか。

これらは大会結果や運営手順に影響するため、推測で変更しません。

## 回帰テスト

`__tests__/lib/qualification-schedule-policy.test.ts` で現在の境界と判定理由を独立して固定しています。`__tests__/lib/qualification-schedule-diagnostics.test.ts` では複数モード・複数グループをまとめた診断結果と、明示的なcircle設定の維持を検証します。`__tests__/components/tournament/qualification-schedule-diagnostics-panel.test.tsx` では管理UIが保存された方式と実効方式の差、circle/CDMの実効方式、判定理由、未対応CDM requestの警告、空モードを表示することを確認します。Issue #3054 の要件確定後は、まずpolicyテストの期待値を仕様に合わせて更新し、その後にpolicy・E2Eを変更します。
