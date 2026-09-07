# 予選グループの対戦表方式

Issue #3054 の仕様検討で、既存実装と「TTでもCDM方式を使う」という要望を混同しないための現状整理です。

## 現在の実装

大会には `qualificationScheduleMethod` が保存されます。新規大会は `cdm` として作成されますが、実際に各グループへ適用する方式は `resolveQualificationScheduleMethodForGroup` が人数ごとに決定します。

- 保存された方針が `circle`: 人数によらずcircle
- 保存された方針が `cdm` かつ13名以下: circle
- 保存された方針が `cdm` かつ14〜20名: CDM fixture
- 保存された方針が `cdm` かつ21名以上: CDMを要求し、round-robin生成時に未対応人数として明示エラー

このため、新規大会が `cdm` 方針であっても、13名以下のグループは現在も従来のcircle methodです。

`getQualificationSchedulePolicyDecision` はこの判定を `configuredMethod` / `playerCount` / `effectiveMethod` / `reason` として返します。現在の13→14境界を診断・テスト・将来の管理UIで再実装せず参照できるようにするための読み取り専用情報で、対戦表の生成結果自体は変更しません。

現在の `reason` は次の3種類です。

- `configured-circle`: 大会設定自体がcircle
- `cdm-small-group-legacy-circle`: CDM-first大会だが13名以下なので現行policyによりcircle
- `cdm-requested`: 14名以上なのでCDM生成を要求する。21名以上などfixture未対応人数は後段で明示エラー

一方、低レベルの `generateRoundRobinSchedule(..., { method: 'cdm' })` 自体は RR 2025 Start の fixture に合わせて 7〜12名にも対応しています。つまり「fixtureが存在する人数」と「大会運用上CDMを選択する人数」は同じではありません。この差は意図的なpolicy境界として扱い、Issue #3054 の仕様決定なしに変更しません。

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
3. 既存の `circle` 大会を変更するのか、新規セットアップだけを対象とするのか。
4. fixture容量と実人数が異なる場合（7→8、9→10、11→12、14/15→16、17→18、19→20）のBREAK配置をTTでもそのまま採用するのか。

これらは大会結果や運営手順に影響するため、推測で変更しません。

## 回帰テスト

`__tests__/lib/qualification-schedule-policy.test.ts` で現在の境界と判定理由を独立して固定しています。Issue #3054 の要件確定後は、まずこのテストの期待値を仕様に合わせて更新し、その後にpolicy・E2Eを変更します。
